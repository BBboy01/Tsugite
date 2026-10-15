import { getFileById, listFiles } from "@iris/shared";
import type { EditorIntelligence, IntelligenceFile } from "./editor-intelligence";
import type { RoomClient } from "./room-client";
import { TypeScriptWorkerClient } from "./typescript-worker-client";
import { isSourcePath } from "./typescript-worker-protocol";

const SNAPSHOT_RECOVERY_DELAY_MS = 100;

export type EditorIntelligenceService = Pick<
  RoomTypeScriptIntelligence,
  "getServiceStatus" | "subscribeServiceStatus"
>;

export type RoomTypeScriptIntelligenceOptions = {
  createIntelligence?: (files: readonly IntelligenceFile[]) => EditorIntelligence;
};

export type EditorIntelligenceServiceStatus = Readonly<{
  state: "loading" | "ready" | "fallback" | "unavailable" | "disposed";
  reason?: string;
}>;

type StatusAwareIntelligence = EditorIntelligence & {
  getStatusSnapshot?: () => EditorIntelligenceServiceStatus;
  subscribeStatus?: (listener: () => void) => () => void;
};

function createWorkerIntelligence(files: readonly IntelligenceFile[]): EditorIntelligence {
  return new TypeScriptWorkerClient(files, {
    lazyStart: true,
    createFallback: async (snapshot) => {
      const { createMainThreadTypeScriptIntelligence } =
        await import("./typescript-main-thread-fallback");
      return createMainThreadTypeScriptIntelligence(snapshot);
    },
  });
}

export class RoomTypeScriptIntelligence {
  readonly intelligence: EditorIntelligence;
  private unsubscribe: () => void;
  private disposed = false;
  private snapshotRevision = 0;
  private sources = new Map<string, IntelligenceFile>();
  private fileIds = new Map<string, string>();
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
        this.sources = new Map(
          next.filter((file) => isSourcePath(file.path)).map((file) => [file.path, file]),
        );
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
        if (!isSourcePath(current.path)) {
          if (previousPath) this.sources.delete(previousPath);
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
  getServiceStatus = (): EditorIntelligenceServiceStatus => this.serviceStatus;
  subscribeServiceStatus = (listener: () => void): (() => void) => {
    this.serviceListeners.add(listener);
    return () => this.serviceListeners.delete(listener);
  };
  get revision(): number {
    return this.intelligence.workspaceVersion;
  }
  get status() {
    switch (this.serviceStatus.state) {
      case "loading":
        return "worker";
      case "unavailable":
        return "disabled";
      case "fallback":
        return "fallback";
      default:
        return this.serviceStatus.state;
    }
  }
  get disabledReason(): string | undefined {
    return this.serviceStatus.reason;
  }
  get currentSnapshotRevision(): number {
    return this.snapshotRevision;
  }
  private readSources(): IntelligenceFile[] {
    const files = this.client.doc.getByPath("files") ? listFiles(this.client.doc) : [];
    this.fileIds = new Map(files.map((file) => [file.id, file.path]));
    const source = files
      .filter((file) => isSourcePath(file.path))
      .map((file) => ({ path: file.path, text: file.text.toString() }));
    return source;
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
      this.sources = new Map(
        next.filter((file) => isSourcePath(file.path)).map((file) => [file.path, file]),
      );
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
    this.serviceStatus = { state: "disposed" };
    this.serviceListeners.forEach((listener) => listener());
    this.cancelSnapshotRecovery();
    this.unsubscribe();
    this.unsubscribeServiceStatus?.();
    this.intelligence.dispose();
    this.sources.clear();
    this.fileIds.clear();
    this.serviceListeners.clear();
  }
}
