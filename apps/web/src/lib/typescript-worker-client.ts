import type {
  EditorIntelligence,
  IntelligenceFile,
  IntelligenceQuery,
  IntelligenceDiagnosticQuery,
  IntelligenceResult,
} from "./editor-intelligence";
import {
  TypeScriptWorkerLifecycle,
  type TypeScriptWorkerMetrics,
} from "./typescript-worker-metrics";
import {
  isIntelligencePath,
  validateQueryPath,
  validateWorkspaceFiles,
  QUERY_TIMEOUT_MS,
  WORKER_QUEUE_LIMIT,
  type QueryMethod,
  type VersionedFile,
  type WorkerEnvelope,
  type WorkerReply,
  type WorkerRequest,
} from "./typescript-worker-protocol";

export type { TypeScriptWorkerMetrics, TypeScriptWorkerStatus } from "./typescript-worker-metrics";

export type IntelligenceWorker = {
  postMessage(request: WorkerRequest): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<WorkerReply>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
};
export type TypeScriptWorkerOptions = {
  createWorker?: () => IntelligenceWorker;
  lazyStart?: boolean;
  onMetrics?: (metrics: TypeScriptWorkerMetrics) => void;
};
type Pending = WorkerEnvelope & {
  resolve: (result: IntelligenceResult<unknown>) => void;
  timer: ReturnType<typeof setTimeout>;
  callerId?: string;
  kind: WorkerRequest["kind"];
  method?: QueryMethod;
};

export class TypeScriptWorkerClient implements EditorIntelligence {
  private files = new Map<string, VersionedFile>();
  private versions = new Map<string, number>();
  private version = 0;
  private epoch = 0;
  private counter = 0;
  private worker?: IntelligenceWorker;
  private pending = new Map<string, Pending>();
  private disposed = false;
  private disabled?: string;
  private rejectedSnapshot?: string;
  private workspaceListeners = new Set<() => void>();
  private readonly lifecycle: TypeScriptWorkerLifecycle;
  constructor(
    files: readonly IntelligenceFile[],
    private readonly options: TypeScriptWorkerOptions = {},
  ) {
    this.lifecycle = new TypeScriptWorkerLifecycle(options.onMetrics);
    this.publish(files);
    if (!this.disabled && !this.rejectedSnapshot && !options.lazyStart) this.start();
  }
  get workspaceVersion(): number {
    return this.version;
  }
  get status(): "worker" | "disabled" | "disposed" {
    return this.disposed
      ? "disposed"
      : this.disabled || this.rejectedSnapshot
        ? "disabled"
        : "worker";
  }
  get disabledReason(): string | undefined {
    return this.disabled ?? this.rejectedSnapshot;
  }
  getStatusSnapshot = () => this.lifecycle.getStatusSnapshot();
  getMetricsSnapshot = (): TypeScriptWorkerMetrics => this.lifecycle.getMetricsSnapshot();
  subscribeStatus = (listener: () => void): (() => void) =>
    this.lifecycle.subscribeStatus(listener);
  subscribeWorkspace = (listener: () => void): (() => void) => {
    this.workspaceListeners.add(listener);
    return () => this.workspaceListeners.delete(listener);
  };
  private notifyWorkspace(): void {
    this.workspaceListeners.forEach((listener) => listener());
  }
  private publish(files: readonly IntelligenceFile[]): IntelligenceResult<number> {
    const sources = files.filter((file) => isIntelligencePath(file.path));
    const invalid = validateWorkspaceFiles(sources);
    if (invalid) {
      this.rejectedSnapshot = invalid;
      this.stop();
      this.version++;
      this.settle({ status: "cancelled" });
      this.lifecycle.setStatus("unavailable", invalid);
      this.notifyWorkspace();
      return { status: "error", message: invalid };
    }
    if (this.disabled) return { status: "error", message: this.disabled };
    const recovered = this.rejectedSnapshot !== undefined;
    this.rejectedSnapshot = undefined;
    const changes: VersionedFile[] = [];
    const paths = new Set(sources.map((file) => file.path));
    const deleted = [...this.files.keys()].filter((path) => !paths.has(path));
    deleted.forEach((path) => this.versions.delete(path));
    for (const file of sources)
      if (this.files.get(file.path)?.text !== file.text) {
        const version = (this.versions.get(file.path) ?? 0) + 1;
        this.versions.set(file.path, version);
        changes.push({ ...file, version });
      }
    if (!this.version || changes.length || deleted.length) {
      this.version++;
      deleted.forEach((path) => this.files.delete(path));
      changes.forEach((file) => this.files.set(file.path, file));
      if (this.worker) {
        if (this.pending.size >= WORKER_QUEUE_LIMIT) this.fail();
        else {
          const envelope = this.envelope();
          this.pending.set(envelope.requestId, {
            ...envelope,
            kind: "update",
            timer: setTimeout(() => this.fail(), QUERY_TIMEOUT_MS),
            resolve() {},
          });
          this.post({ ...envelope, kind: "update", changes, deleted });
        }
      }
      this.notifyWorkspace();
    } else if (recovered) this.notifyWorkspace();
    return { status: "ok", value: this.version };
  }
  syncWorkspace(files: readonly IntelligenceFile[]): Promise<IntelligenceResult<number>> {
    if (this.disposed) return Promise.resolve({ status: "disposed" });
    const result = this.publish(files);
    if (result.status === "ok") this.ensureStarted();
    return Promise.resolve(result);
  }
  updateFile(file: IntelligenceFile): Promise<IntelligenceResult<null>> {
    if (this.disposed) return Promise.resolve({ status: "disposed" });
    if (this.rejectedSnapshot)
      return Promise.resolve({ status: "error", message: this.rejectedSnapshot });
    const files = [...this.files.values()].filter((item) => item.path !== file.path);
    files.push({ ...file, version: 0 });
    const result = this.publish(files);
    if (result.status === "ok") this.ensureStarted();
    return Promise.resolve(result.status === "ok" ? { status: "ok", value: null } : result);
  }
  hover(query: IntelligenceQuery) {
    return this.query<Awaited<ReturnType<EditorIntelligence["hover"]>>>("hover", query);
  }
  completion(query: IntelligenceQuery) {
    return this.query<Awaited<ReturnType<EditorIntelligence["completion"]>>>("completion", query);
  }
  signatureHelp(query: IntelligenceQuery) {
    return this.query<Awaited<ReturnType<EditorIntelligence["signatureHelp"]>>>(
      "signatureHelp",
      query,
    );
  }
  diagnostics(query: IntelligenceDiagnosticQuery) {
    return this.query<Awaited<ReturnType<EditorIntelligence["diagnostics"]>>>("diagnostics", query);
  }
  definition(query: IntelligenceQuery) {
    return this.query<Awaited<ReturnType<EditorIntelligence["definition"]>>>("definition", query);
  }
  typeDefinition(query: IntelligenceQuery) {
    return this.query<Awaited<ReturnType<EditorIntelligence["typeDefinition"]>>>(
      "typeDefinition",
      query,
    );
  }
  implementation(query: IntelligenceQuery) {
    return this.query<Awaited<ReturnType<EditorIntelligence["implementation"]>>>(
      "implementation",
      query,
    );
  }
  references(query: IntelligenceQuery) {
    return this.query<Awaited<ReturnType<EditorIntelligence["references"]>>>("references", query);
  }
  private query<R extends IntelligenceResult<unknown>>(
    method: QueryMethod,
    query: IntelligenceQuery | IntelligenceDiagnosticQuery,
  ): Promise<R> {
    if (this.disposed) return Promise.resolve({ status: "disposed" } as R);
    if (this.disabled || this.rejectedSnapshot)
      return Promise.resolve({
        status: "error",
        message: this.disabled ?? this.rejectedSnapshot!,
      } as R);
    const invalidPath = validateQueryPath(query.path);
    if (invalidPath) return Promise.resolve({ status: "error", message: invalidPath } as R);
    if (query.revision !== undefined && query.revision !== this.version)
      return Promise.resolve({ status: "cancelled" } as R);
    this.ensureStarted();
    if (this.disabled) return Promise.resolve({ status: "error", message: this.disabled } as R);
    if (this.pending.size >= WORKER_QUEUE_LIMIT)
      return Promise.resolve({ status: "error", message: "TypeScript worker queue is full" } as R);
    const envelope = this.envelope();
    return new Promise<IntelligenceResult<unknown>>((resolve) => {
      const timer = setTimeout(
        () => {
          this.pending.delete(envelope.requestId);
          resolve({ status: "timeout" });
          this.post({ ...this.envelope(), kind: "cancel", target: envelope.requestId });
        },
        Math.min(QUERY_TIMEOUT_MS, Math.max(0, query.timeoutMs ?? QUERY_TIMEOUT_MS)),
      );
      this.pending.set(envelope.requestId, {
        ...envelope,
        resolve,
        timer,
        callerId: query.requestId,
        kind: "query",
        method,
      });
      this.post({ ...envelope, kind: "query", method, query });
    }) as Promise<R>;
  }
  cancel(requestId: string): void {
    for (const pending of this.pending.values())
      if (pending.callerId === requestId) {
        this.finish(pending, { status: "cancelled" });
        this.post({ ...this.envelope(), kind: "cancel", target: pending.requestId });
      }
  }
  private envelope(): WorkerEnvelope {
    return { epoch: this.epoch, requestId: `${++this.counter}`, workspaceVersion: this.version };
  }
  private restoreNavigationSources(
    method: QueryMethod | undefined,
    reply: WorkerReply,
  ): IntelligenceResult<unknown> {
    if (
      !method ||
      !["definition", "typeDefinition", "implementation", "references"].includes(method) ||
      reply.result.status !== "ok" ||
      !Array.isArray(reply.result.value) ||
      !reply.sourceSnapshots
    )
      return reply.result;
    return {
      ...reply.result,
      value: reply.result.value.map((location) => {
        if (!location || typeof location !== "object") return location;
        const item = location as Record<string, unknown>;
        const path = item.path;
        if (typeof path !== "string" || typeof reply.sourceSnapshots?.[path] !== "string")
          return location;
        return { ...item, source: reply.sourceSnapshots[path] };
      }),
    };
  }
  private ensureStarted(): void {
    if (!this.worker && !this.disabled && !this.disposed) this.start();
  }
  private start(): void {
    this.epoch++;
    this.lifecycle.start(this.epoch > 1);
    try {
      const worker =
        this.options.createWorker?.() ??
        new Worker(new URL("./typescript.worker.ts", import.meta.url), { type: "module" });
      this.worker = worker;
      worker.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
        if (data.epoch !== this.epoch || this.disposed) return;
        const pending = this.pending.get(data.requestId);
        if (pending) {
          if (data.workspaceVersion !== pending.workspaceVersion) return;
          this.finish(
            pending,
            pending.workspaceVersion !== this.version && pending.kind === "query"
              ? { status: "cancelled" }
              : this.restoreNavigationSources(pending.method, data),
          );
          if (pending.kind === "initialize") {
            if (data.result.status === "ok") {
              this.lifecycle.setStatus("ready");
              this.notifyWorkspace();
            } else this.fail();
          } else if (pending.kind === "update" && data.result.status !== "ok") this.fail();
        }
      };
      worker.onerror = (event) => {
        event.preventDefault();
        this.fail();
      };
      worker.onmessageerror = () => this.fail();
      const envelope = this.envelope();
      const timer = setTimeout(() => this.fail(), QUERY_TIMEOUT_MS);
      this.pending.set(envelope.requestId, {
        ...envelope,
        kind: "initialize",
        timer,
        resolve() {},
      });
      this.post({ ...envelope, kind: "initialize", files: [...this.files.values()] });
    } catch {
      this.fail();
    }
  }
  private post(message: WorkerRequest): void {
    try {
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- Dedicated Worker transport.
      this.worker?.postMessage(message);
    } catch {
      this.fail();
    }
  }
  private fail(): void {
    if (this.disposed || this.disabled) return;
    this.stop();
    this.settle({ status: "error", message: "TypeScript worker failed" });
    if (this.epoch < 2) this.start();
    else {
      this.disabled = "TypeScript worker failed";
      this.lifecycle.setStatus("unavailable", this.disabled);
    }
  }
  private finish(pending: Pending, result: IntelligenceResult<unknown>): void {
    clearTimeout(pending.timer);
    this.pending.delete(pending.requestId);
    pending.resolve(result);
  }
  private settle(result: IntelligenceResult<unknown>): void {
    for (const pending of this.pending.values()) this.finish(pending, result);
  }
  private stop(): void {
    if (!this.worker) return;
    this.worker.onmessage = this.worker.onerror = this.worker.onmessageerror = null;
    this.worker.terminate();
    this.worker = undefined;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.lifecycle.setStatus("disposed");
    this.stop();
    this.settle({ status: "disposed" });
    this.files.clear();
    this.versions.clear();
    this.lifecycle.clearListeners();
    this.workspaceListeners.clear();
  }
}
