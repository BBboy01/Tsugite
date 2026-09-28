import type { PackageManager, ProjectFile } from "@iris/shared";

import { buildPreviewFileSystemTree } from "./webcontainer-files";
import type { RuntimeContainer } from "./webcontainer-runtime";

type Snapshot = { files: Map<string, string>; folders: Set<string> };
type IsCurrent = () => boolean;
type SyncResult = { packageChanged: boolean };

export class WebContainerFileSync {
  private snapshot: Snapshot = { files: new Map(), folders: new Set() };
  private pending: Promise<unknown> = Promise.resolve();
  private packageChangePending = false;

  constructor(private readonly container: Pick<RuntimeContainer, "fs" | "mount">) {}

  mount(
    files: ProjectFile[],
    folders: string[],
    packageManager: PackageManager,
    isCurrent: IsCurrent,
  ): Promise<void> {
    const next = createSnapshot(files, folders);
    const tree = buildPreviewFileSystemTree(files, folders, packageManager);
    return this.enqueue(
      isCurrent,
      async () => {
        if (!(await this.removeObsolete(next, isCurrent))) return;
        await this.container.mount(tree);
        this.snapshot = next;
        this.packageChangePending = false;
      },
      undefined,
    );
  }

  sync(files: ProjectFile[], folders: string[], isCurrent: IsCurrent): Promise<SyncResult> {
    const next = createSnapshot(files, folders);
    const cancelled = { packageChanged: false };
    return this.enqueue(
      isCurrent,
      async () => {
        const previousPackage = this.snapshot.files.get("package.json");
        const packageChanged =
          this.packageChangePending || previousPackage !== next.files.get("package.json");
        if (packageChanged) this.packageChangePending = true;
        if (!(await this.removeObsolete(next, isCurrent))) return cancelled;

        for (const path of next.folders) {
          if (!isCurrent()) return cancelled;
          if (this.snapshot.folders.has(path)) continue;
          await this.container.fs.mkdir(`/${path}`, { recursive: true });
          this.snapshot.folders.add(path);
        }

        for (const [path, contents] of next.files) {
          if (!isCurrent()) return cancelled;
          if (this.snapshot.files.get(path) === contents) continue;
          await this.container.fs.writeFile(`/${path}`, contents);
          this.snapshot.files.set(path, contents);
        }

        this.packageChangePending = false;
        return { packageChanged: isCurrent() && packageChanged };
      },
      cancelled,
    );
  }

  syncChangedFiles(files: ProjectFile[], isCurrent: IsCurrent): Promise<SyncResult> {
    const changed = files.map((file) => [file.path, file.text.toString()] as const);
    const cancelled = { packageChanged: false };
    return this.enqueue(
      isCurrent,
      async () => {
        const previousPackage = this.snapshot.files.get("package.json");
        const nextPackage = changed.find(([path]) => path === "package.json")?.[1];
        const includesPackage = nextPackage !== undefined;
        const packageChanged =
          includesPackage && (this.packageChangePending || previousPackage !== nextPackage);
        if (packageChanged) this.packageChangePending = true;

        for (const [path, contents] of changed) {
          if (!isCurrent()) return cancelled;
          if (this.snapshot.files.get(path) === contents) continue;
          await this.container.fs.writeFile(`/${path}`, contents);
          this.snapshot.files.set(path, contents);
        }

        if (includesPackage) this.packageChangePending = false;
        return { packageChanged: isCurrent() && packageChanged };
      },
      cancelled,
    );
  }

  private async removeObsolete(next: Snapshot, isCurrent: IsCurrent): Promise<boolean> {
    for (const path of this.snapshot.files.keys()) {
      if (!isCurrent()) return false;
      if (next.files.has(path)) continue;
      await this.container.fs.rm(`/${path}`, { force: true });
      this.snapshot.files.delete(path);
    }
    for (const path of [...this.snapshot.folders].toSorted((a, b) => b.length - a.length)) {
      if (!isCurrent()) return false;
      if (next.folders.has(path)) continue;
      await this.container.fs.rm(`/${path}`, { force: true, recursive: true });
      this.snapshot.folders.delete(path);
    }
    return isCurrent();
  }

  private enqueue<T>(isCurrent: IsCurrent, operation: () => Promise<T>, cancelled: T): Promise<T> {
    const result = this.pending.then(async () => {
      if (!isCurrent()) return cancelled;
      try {
        return await operation();
      } catch (error) {
        if (!isCurrent()) return cancelled;
        throw error;
      }
    });
    this.pending = result.catch(() => undefined);
    return result;
  }
}

function createSnapshot(files: ProjectFile[], folders: string[]): Snapshot {
  const fileMap = new Map(files.map((file) => [file.path, file.text.toString()]));
  const folderSet = new Set(folders);
  for (const path of [...fileMap.keys(), ...folders]) {
    const segments = path.split("/").slice(0, -1);
    for (let index = 1; index <= segments.length; index += 1) {
      folderSet.add(segments.slice(0, index).join("/"));
    }
  }
  return { files: fileMap, folders: folderSet };
}
