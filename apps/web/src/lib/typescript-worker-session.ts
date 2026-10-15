import type {
  EditorIntelligence,
  IntelligenceFile,
  IntelligenceResult,
} from "./editor-intelligence";
import {
  isSafeSourcePath,
  validateQueryPath,
  validateWorkspaceFiles,
  WORKER_QUEUE_LIMIT,
  NAVIGATION_LIMITS,
  type VersionedFile,
  type WorkerReply,
  type WorkerRequest,
} from "./typescript-worker-protocol";

const navigationMethods = new Set(["definition", "typeDefinition", "implementation", "references"]);

function compactNavigationReply(
  request: WorkerRequest,
  result: IntelligenceResult<unknown>,
): { result: IntelligenceResult<unknown>; sourceSnapshots?: Record<string, string> } {
  if (
    request.kind !== "query" ||
    !navigationMethods.has(request.method) ||
    result.status !== "ok" ||
    !Array.isArray(result.value)
  )
    return { result };
  if (result.value.length > NAVIGATION_LIMITS.locations)
    return { result: { status: "error", message: "Too many TypeScript navigation results" } };
  const sourceSnapshots: Record<string, string> = {};
  let sourceBytes = 0;
  const value = result.value.map((location) => {
    if (!location || typeof location !== "object") return location;
    const item = location as Record<string, unknown>;
    const path = item.path;
    const source = item.source;
    if (typeof path !== "string" || typeof source !== "string") return location;
    if (!(path in sourceSnapshots)) {
      sourceBytes += new TextEncoder().encode(source).byteLength;
      if (sourceBytes > NAVIGATION_LIMITS.sourceBytes)
        throw new Error("TypeScript navigation source snapshot limit exceeded");
      sourceSnapshots[path] = source;
    }
    const { source: _source, ...withoutSource } = item;
    return withoutSource;
  });
  return { result: { ...result, value }, sourceSnapshots };
}

export class TypeScriptWorkerSession {
  private engine?: EditorIntelligence;
  private files = new Map<string, VersionedFile>();
  private versions = new Map<string, number>();
  private epoch = 0;
  private version = 0;
  private queued = 0;
  private queue = Promise.resolve();
  private cancelled = new Set<string>();
  private initializingEpochs = new Set<number>();
  private disposed = false;
  constructor(
    private readonly createEngine: (
      files: readonly IntelligenceFile[],
    ) => EditorIntelligence | Promise<EditorIntelligence>,
  ) {}

  enqueue(request: WorkerRequest): Promise<WorkerReply> {
    const reply = (
      result: IntelligenceResult<unknown>,
      sourceSnapshots?: Record<string, string>,
    ): WorkerReply => ({
      epoch: request.epoch,
      requestId: request.requestId,
      workspaceVersion: request.workspaceVersion,
      result,
      ...(sourceSnapshots ? { sourceSnapshots } : {}),
    });
    if (this.disposed) return Promise.resolve(reply({ status: "disposed" }));
    if (request.kind === "cancel") {
      if (request.epoch === this.epoch || this.initializingEpochs.has(request.epoch)) {
        this.cancelled.add(request.target);
        this.engine?.cancel(request.target);
        if (this.cancelled.size > WORKER_QUEUE_LIMIT)
          this.cancelled.delete(this.cancelled.values().next().value!);
      }
      return Promise.resolve(reply({ status: "ok", value: null }));
    }
    if (this.queued >= WORKER_QUEUE_LIMIT)
      return Promise.resolve(
        reply({ status: "error", message: "TypeScript worker queue is full" }),
      );
    if (request.kind === "initialize") this.initializingEpochs.add(request.epoch);
    this.queued++;
    const task = this.queue.then(async () => {
      try {
        let result: IntelligenceResult<unknown>;
        try {
          result = await this.handle(request);
        } catch (error) {
          return reply({
            status: "error",
            message: error instanceof Error ? error.message : "TypeScript worker failed",
          });
        }
        const compacted = compactNavigationReply(request, result);
        return reply(compacted.result, compacted.sourceSnapshots);
      } catch (error) {
        return reply({
          status: "error",
          message: error instanceof Error ? error.message : "TypeScript worker failed",
        });
      } finally {
        this.queued--;
        this.cancelled.delete(request.requestId);
        if (request.kind === "initialize") this.initializingEpochs.delete(request.epoch);
      }
    });
    this.queue = task.then(() => {});
    return task;
  }

  private async handle(request: WorkerRequest): Promise<IntelligenceResult<unknown>> {
    if (this.disposed) return { status: "disposed" };
    if (request.kind === "initialize") {
      const invalid = validateWorkspaceFiles(request.files);
      if (
        invalid ||
        request.epoch <= this.epoch ||
        request.workspaceVersion < 1 ||
        request.files.some((file) => !Number.isSafeInteger(file.version) || file.version < 1)
      )
        return { status: "error", message: invalid ?? "Invalid TypeScript initialization version" };
      this.engine?.dispose();
      const engine = await this.createEngine(request.files);
      if (this.disposed) {
        engine.dispose();
        return { status: "disposed" };
      }
      this.engine = engine;
      this.files = new Map(request.files.map((file) => [file.path, file]));
      this.versions = new Map(request.files.map((file) => [file.path, file.version]));
      this.epoch = request.epoch;
      this.version = request.workspaceVersion;
      return { status: "ok", value: null };
    }
    if (request.kind === "query" && this.cancelled.has(request.requestId))
      return { status: "cancelled" };
    if (!this.engine) return { status: "error", message: "TypeScript worker is not initialized" };
    if (request.epoch !== this.epoch) return { status: "cancelled" };
    if (request.kind === "update") {
      if (
        request.workspaceVersion !== this.version + 1 ||
        request.deleted.some((path) => !isSafeSourcePath(path)) ||
        request.changes.some(
          (file) =>
            !Number.isSafeInteger(file.version) ||
            file.version <= (this.versions.get(file.path) ?? 0),
        )
      )
        return { status: "error", message: "Invalid TypeScript update version" };
      const next = new Map(this.files);
      request.deleted.forEach((path) => next.delete(path));
      request.changes.forEach((file) => next.set(file.path, file));
      const invalid = validateWorkspaceFiles([...next.values()]);
      if (invalid) return { status: "error", message: invalid };
      const result = request.deleted.length
        ? await this.engine.syncWorkspace([...next.values()])
        : ({ status: "ok" } as const);
      if (result.status !== "ok") return result;
      if (!request.deleted.length)
        for (const file of request.changes) {
          const updated = await this.engine.updateFile(file);
          if (updated.status !== "ok") return updated;
        }
      this.files = next;
      request.deleted
        .filter((path) => !request.changes.some((file) => file.path === path))
        .forEach((path) => this.versions.delete(path));
      request.changes.forEach((file) => this.versions.set(file.path, file.version));
      this.version = request.workspaceVersion;
      return { status: "ok", value: null };
    }
    if (request.kind !== "query") return { status: "empty" };
    const invalidPath = validateQueryPath(request.query.path);
    if (invalidPath) return { status: "error", message: invalidPath };
    if (request.workspaceVersion !== this.version || this.cancelled.has(request.requestId))
      return { status: "cancelled" };
    const query = { ...request.query, requestId: request.requestId, revision: undefined };
    const engine = this.engine;
    switch (request.method) {
      case "hover":
        return engine.hover(query as import("./editor-intelligence").IntelligenceQuery);
      case "completion":
        return engine.completion(query as import("./editor-intelligence").IntelligenceQuery);
      case "signatureHelp":
        return engine.signatureHelp(query as import("./editor-intelligence").IntelligenceQuery);
      case "diagnostics":
        return engine.diagnostics(query);
      case "definition":
        return engine.definition(query as import("./editor-intelligence").IntelligenceQuery);
      case "typeDefinition":
        return engine.typeDefinition(query as import("./editor-intelligence").IntelligenceQuery);
      case "implementation":
        return engine.implementation(query as import("./editor-intelligence").IntelligenceQuery);
      case "references":
        return engine.references(query as import("./editor-intelligence").IntelligenceQuery);
    }
  }
  dispose(): void {
    this.disposed = true;
    this.engine?.dispose();
    this.engine = undefined;
    this.files.clear();
    this.versions.clear();
    this.cancelled.clear();
  }
}
