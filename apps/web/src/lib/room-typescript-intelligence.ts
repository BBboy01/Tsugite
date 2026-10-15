import { getFileById, listFiles } from "@iris/shared";
import type { EditorIntelligence, IntelligenceFile } from "./editor-intelligence";
import type { RoomClient } from "./room-client";
import { validateDeclarationFiles } from "./typescript-declarations";
import { TypeScriptWorkerClient } from "./typescript-worker-client";

const SNAPSHOT_RECOVERY_DELAY_MS = 100;

export type DeclarationsStatus =
  | { status: "loading" | "ready" }
  | { status: "unavailable"; reason: string };

export type ProjectDeclarations = Pick<
  RoomTypeScriptIntelligence,
  | "loadDeclarations"
  | "clearDeclarations"
  | "prepareDeclarations"
  | "getDeclarationsStatus"
  | "subscribeDeclarations"
  | "getServiceStatus"
  | "subscribeServiceStatus"
>;

export type RoomTypeScriptIntelligenceOptions = {
  createIntelligence?: (files: readonly IntelligenceFile[]) => EditorIntelligence;
};

export type EditorIntelligenceServiceStatus = Readonly<{
  state: "loading" | "ready" | "unavailable" | "disposed";
  reason?: string;
}>;

type StatusAwareIntelligence = EditorIntelligence & {
  getStatusSnapshot?: () => EditorIntelligenceServiceStatus;
  subscribeStatus?: (listener: () => void) => () => void;
};

function createWorkerIntelligence(files: readonly IntelligenceFile[]): EditorIntelligence {
  return new TypeScriptWorkerClient(files, { lazyStart: true });
}

export class RoomTypeScriptIntelligence {
  readonly intelligence: EditorIntelligence;
  private declarations = new Map<string, IntelligenceFile>();
  private unsubscribe: () => void;
  private disposed = false;
  private snapshotRevision = 0;
  private sources = new Map<string, IntelligenceFile>();
  private fileIds = new Map<string, string>();
  private declarationGeneration = 0;
  private declarationStatus: DeclarationsStatus = { status: "loading" };
  private declarationListeners = new Set<() => void>();
  private serviceListeners = new Set<() => void>();
  private serviceStatus: EditorIntelligenceServiceStatus = { state: "ready" };
  private snapshotRecoveryTimer?: ReturnType<typeof setTimeout>;
  private unsubscribeServiceStatus?: () => void;
  constructor(
    private readonly client: Pick<RoomClient, "doc">,
    options: RoomTypeScriptIntelligenceOptions = {},
  ) {
    const initial = this.readSources();
    initial.forEach((file) => this.sources.set(file.path, file));
    this.intelligence = options.createIntelligence?.(initial) ?? createWorkerIntelligence(initial);
    const statusAware = this.intelligence as StatusAwareIntelligence;
    if (statusAware.getStatusSnapshot && statusAware.subscribeStatus) {
      this.serviceStatus = statusAware.getStatusSnapshot();
      this.unsubscribeServiceStatus = statusAware.subscribeStatus(() => {
        this.serviceStatus = statusAware.getStatusSnapshot!();
        if (this.serviceStatus.state !== "unavailable") this.cancelSnapshotRecovery();
        this.serviceListeners.forEach((listener) => listener());
      });
    }
    this.unsubscribe = client.doc.subscribe((batch) => {
      const roots = batch.events
        .map((event) => event.path[0])
        .filter((root): root is string => typeof root === "string");
      if (
        !roots.some((root) => root.startsWith("file:") || root === "files" || root === "filePaths")
      )
        return;
      this.snapshotRevision++;
      if (roots.some((root) => root === "files" || root === "filePaths")) {
        const next = this.readSources();
        this.sources = new Map(next.map((file) => [file.path, file]));
        void this.intelligence.syncWorkspace(next);
        return;
      }
      for (const root of new Set(roots.filter((path) => path.startsWith("file:")))) {
        const fileId = root.slice("file:".length);
        const previousPath = this.fileIds.get(fileId);
        const previous = previousPath ? this.sources.get(previousPath) : undefined;
        const current = getFileById(client.doc, fileId);
        if (previousPath && current?.path !== previousPath) this.sources.delete(previousPath);
        if (!current) {
          if (previousPath) {
            this.sources.delete(previousPath);
            if (this.isRecoverableSourceSnapshot()) this.scheduleSnapshotRecovery();
          }
          continue;
        }
        const file = { path: current.path, text: current.text.toString() };
        this.fileIds.set(fileId, current.path);
        this.sources.set(current.path, file);
        if (this.serviceStatus.state === "unavailable") {
          if (
            previous &&
            file.text.length <= previous.text.length &&
            this.isRecoverableSourceSnapshot()
          )
            this.scheduleSnapshotRecovery();
          continue;
        }
        void this.intelligence.updateFile(file);
      }
    });
  }
  async syncDeclarations(files: readonly IntelligenceFile[]): Promise<void> {
    if (this.disposed) return;
    const generation = ++this.declarationGeneration;
    await this.publishDeclarations(files, generation);
  }
  loadDeclarations = async (
    read: (sources: readonly IntelligenceFile[]) => Promise<readonly IntelligenceFile[]>,
  ): Promise<void> => {
    if (this.disposed) return;
    const generation = ++this.declarationGeneration;
    this.declarations.clear();
    void this.intelligence.syncWorkspace(this.readSources());
    this.setDeclarationStatus({ status: "loading" });
    try {
      const files = await read(this.readSources());
      if (this.disposed || generation !== this.declarationGeneration) return;
      await this.publishDeclarations(files, generation);
    } catch (error) {
      if (this.disposed || generation !== this.declarationGeneration) return;
      await this.clearDeclarations(
        error instanceof Error ? error.message : "Declaration scan failed",
      );
    }
  };
  prepareDeclarations = (): void => {
    if (this.disposed) return;
    ++this.declarationGeneration;
    this.declarations.clear();
    void this.intelligence.syncWorkspace(this.readSources());
    this.setDeclarationStatus({ status: "loading" });
  };
  clearDeclarations = async (reason?: string): Promise<void> => {
    if (this.disposed) return;
    const generation = ++this.declarationGeneration;
    this.declarations.clear();
    await this.intelligence.syncWorkspace(this.readSources());
    if (!this.disposed && generation === this.declarationGeneration)
      this.setDeclarationStatus(reason ? { status: "unavailable", reason } : { status: "ready" });
  };
  getDeclarationsStatus = (): DeclarationsStatus => this.declarationStatus;
  subscribeDeclarations = (listener: () => void): (() => void) => {
    this.declarationListeners.add(listener);
    return () => this.declarationListeners.delete(listener);
  };
  getServiceStatus = (): EditorIntelligenceServiceStatus => this.serviceStatus;
  subscribeServiceStatus = (listener: () => void): (() => void) => {
    this.serviceListeners.add(listener);
    return () => this.serviceListeners.delete(listener);
  };
  private async publishDeclarations(files: readonly IntelligenceFile[], generation: number) {
    const invalid = validateDeclarationFiles(files);
    if (invalid) {
      await this.clearDeclarations(invalid);
      return;
    }
    this.declarations = new Map(files.map((file) => [file.path, file]));
    const result = await this.intelligence.syncWorkspace(this.readSources());
    if (this.disposed || generation !== this.declarationGeneration) return;
    this.setDeclarationStatus(
      result.status === "error"
        ? { status: "unavailable", reason: result.message }
        : { status: "ready" },
    );
  }
  private setDeclarationStatus(status: DeclarationsStatus): void {
    const previous = this.declarationStatus;
    if (
      previous.status === status.status &&
      (previous.status !== "unavailable" ||
        (status.status === "unavailable" && previous.reason === status.reason))
    )
      return;
    this.declarationStatus = status;
    this.declarationListeners.forEach((listener) => listener());
  }
  get revision(): number {
    return this.intelligence.workspaceVersion;
  }
  get status() {
    switch (this.serviceStatus.state) {
      case "loading":
        return "worker";
      case "unavailable":
        return "disabled";
      default:
        return this.serviceStatus.state;
    }
  }
  get disabledReason(): string | undefined {
    return this.serviceStatus.reason;
  }
  get budgets() {
    return { maxFiles: 512, maxFileBytes: 1024 * 1024, maxWorkspaceBytes: 16 * 1024 * 1024 };
  }
  get currentSnapshotRevision(): number {
    return this.snapshotRevision;
  }
  getDeclarationsSnapshot(): readonly IntelligenceFile[] {
    return [...this.declarations.values()];
  }
  private readSources(): IntelligenceFile[] {
    const files = this.client.doc.getByPath("files") ? listFiles(this.client.doc) : [];
    this.fileIds = new Map(files.map((file) => [file.id, file.path]));
    const source = files.map((file) => ({ path: file.path, text: file.text.toString() }));
    const sourcePaths = new Set(source.map((file) => file.path));
    return [
      ...source,
      ...[...this.declarations.values()].filter((file) => !sourcePaths.has(file.path)),
    ];
  }
  private isRecoverableSourceSnapshot(): boolean {
    return (
      this.serviceStatus.state === "unavailable" &&
      (this.serviceStatus.reason === "TypeScript source file limit exceeded" ||
        this.serviceStatus.reason === "TypeScript source workspace limit exceeded")
    );
  }
  private scheduleSnapshotRecovery(): void {
    this.cancelSnapshotRecovery();
    this.snapshotRecoveryTimer = setTimeout(() => {
      this.snapshotRecoveryTimer = undefined;
      if (!this.isRecoverableSourceSnapshot() || this.disposed) return;
      const next = this.readSources();
      this.sources = new Map(next.map((file) => [file.path, file]));
      void this.intelligence.syncWorkspace(next);
    }, SNAPSHOT_RECOVERY_DELAY_MS);
  }
  private cancelSnapshotRecovery(): void {
    if (this.snapshotRecoveryTimer) clearTimeout(this.snapshotRecoveryTimer);
    this.snapshotRecoveryTimer = undefined;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    ++this.declarationGeneration;
    this.serviceStatus = { state: "disposed" };
    this.serviceListeners.forEach((listener) => listener());
    this.cancelSnapshotRecovery();
    this.unsubscribe();
    this.unsubscribeServiceStatus?.();
    this.intelligence.dispose();
    this.declarations.clear();
    this.sources.clear();
    this.fileIds.clear();
    this.declarationListeners.clear();
    this.serviceListeners.clear();
  }
}
