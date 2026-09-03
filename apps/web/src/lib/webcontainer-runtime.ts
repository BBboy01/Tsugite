import { WebContainer, type FileSystemTree } from "@webcontainer/api";

import type { PackageManager, ProjectFile } from "@iris/shared";

import { buildFileSystemTree, selectPreviewScript } from "./webcontainer-files";

export type RuntimeState = "idle" | "installing" | "starting" | "ready" | "paused" | "error";
export type RuntimeSettings = {
  packageManager: PackageManager;
  autoInstall: boolean;
  autoStartPreview: boolean;
};
export type RuntimeError =
  | "cross-origin-isolation-required"
  | "storage-partitioning-required"
  | "invalid-package-json"
  | "missing-package-json"
  | "missing-preview-script"
  | "install-failed"
  | "start-failed"
  | "runtime-unavailable";

export type RuntimeEvent =
  | { type: "state"; state: RuntimeState; error?: RuntimeError }
  | { type: "output"; level: "log" | "warn" | "error"; message: string }
  | { type: "server-ready"; port: number; url: string };

export type RuntimeProcess = {
  output: ReadableStream<string>;
  exit: Promise<number>;
  kill: () => void;
};

export type RuntimeContainer = {
  fs: {
    mkdir: (path: string, options: { recursive: true }) => Promise<string>;
    writeFile: (path: string, contents: string) => Promise<void>;
    rm: (path: string, options?: { force?: boolean; recursive?: boolean }) => Promise<void>;
  };
  mount: (tree: FileSystemTree) => Promise<void>;
  spawn: (command: string, args: string[]) => Promise<RuntimeProcess>;
  on: (event: "server-ready", listener: (port: number, url: string) => void) => () => void;
  teardown: () => void;
};

type RuntimeOptions = {
  boot?: () => Promise<RuntimeContainer>;
};

const DEFAULT_RUNTIME_SETTINGS: RuntimeSettings = {
  packageManager: "pnpm",
  autoInstall: true,
  autoStartPreview: true,
};

type Snapshot = {
  files: Map<string, string>;
  folders: Set<string>;
};

export class WebContainerRuntime {
  private readonly boot: () => Promise<RuntimeContainer>;
  private container: RuntimeContainer | undefined;
  private bootPromise: Promise<RuntimeContainer> | undefined;
  private process: RuntimeProcess | undefined;
  private unsubscribeReady: (() => void) | undefined;
  private unsubscribeError: (() => void) | undefined;
  private snapshot: Snapshot = { files: new Map(), folders: new Set() };
  private listener: ((event: RuntimeEvent) => void) | undefined;
  private generation = 0;

  constructor(options: RuntimeOptions = {}) {
    this.boot = options.boot ?? defaultBoot;
  }

  async start(
    files: ProjectFile[],
    folders: string[],
    onEvent: (event: RuntimeEvent) => void,
    settings: RuntimeSettings = DEFAULT_RUNTIME_SETTINGS,
    options: { forceStart?: boolean } = {},
  ): Promise<void> {
    this.listener = onEvent;
    const generation = ++this.generation;
    this.stopProcess();
    this.emit({ type: "state", state: "installing" });

    try {
      const container = await this.getContainer();
      if (generation !== this.generation) return;

      const tree = buildFileSystemTree(files, folders);
      await container.mount(tree);
      this.snapshot = createSnapshot(files, folders);

      const packageFile = files.find((file) => file.path === "package.json");
      if (!packageFile) {
        this.emit({ type: "state", state: "error", error: "missing-package-json" });
        return;
      }

      if (settings.autoInstall) {
        const [installCommand, installArgs] = getInstallCommand(settings.packageManager);
        this.emit({ type: "output", level: "log", message: `${installCommand} install` });
        const install = await withTimeout(container.spawn(installCommand, installArgs), 15_000);
        void consumeOutput(install, this.listener);
        let installCode: number;
        try {
          installCode = await withTimeout(install.exit, 45_000);
        } catch (error) {
          install.kill();
          throw error;
        }
        if (generation !== this.generation) return;
        if (installCode !== 0) {
          this.emit({ type: "state", state: "error", error: "install-failed" });
          return;
        }
      } else {
        this.emit({ type: "output", level: "log", message: "dependency install skipped" });
      }

      if (!settings.autoStartPreview && !options.forceStart) {
        this.emit({ type: "state", state: "paused" });
        return;
      }

      const script = selectPreviewScript(packageFile.text.toString(), settings.packageManager);
      if ("error" in script) {
        this.emit({ type: "state", state: "error", error: script.error });
        return;
      }

      await this.startPreview(container, script.command, script.args, generation);
    } catch (error) {
      if (generation !== this.generation) return;
      this.emit({
        type: "state",
        state: "error",
        error: getRuntimeError(error),
      });
    }
  }

  async sync(files: ProjectFile[], folders: string[]): Promise<{ packageChanged: boolean }> {
    if (!this.container) return { packageChanged: false };
    const next = createSnapshot(files, folders);
    const previousPackage = this.snapshot.files.get("package.json");
    const nextPackage = next.files.get("package.json");

    for (const path of this.snapshot.files.keys()) {
      if (!next.files.has(path)) await this.container.fs.rm(toContainerPath(path), { force: true });
    }

    for (const path of this.snapshot.folders) {
      if (!next.folders.has(path)) {
        const stillUsed = [...next.files.keys()].some((filePath) =>
          filePath.startsWith(`${path}/`),
        );
        if (!stillUsed)
          await this.container.fs.rm(toContainerPath(path), { force: true, recursive: true });
      }
    }

    for (const folder of next.folders) {
      await this.container.fs.mkdir(toContainerPath(folder), { recursive: true });
    }

    for (const [path, contents] of next.files) {
      if (this.snapshot.files.get(path) !== contents) {
        await this.container.fs.writeFile(toContainerPath(path), contents);
      }
    }

    this.snapshot = next;
    return { packageChanged: previousPackage !== nextPackage };
  }

  async restart(
    files: ProjectFile[],
    folders: string[],
    onEvent: (event: RuntimeEvent) => void,
    settings: RuntimeSettings = DEFAULT_RUNTIME_SETTINGS,
    options: { forceStart?: boolean } = {},
  ): Promise<void> {
    await this.start(files, folders, onEvent, settings, options);
  }

  dispose(): void {
    this.generation += 1;
    this.stopProcess();
    this.unsubscribeReady?.();
    this.unsubscribeReady = undefined;
    this.unsubscribeError?.();
    this.unsubscribeError = undefined;
    this.container?.teardown();
    this.container = undefined;
    this.bootPromise = undefined;
    this.snapshot = { files: new Map(), folders: new Set() };
    this.listener = undefined;
  }

  private async getContainer(): Promise<RuntimeContainer> {
    if (this.container) return this.container;
    if (!this.bootPromise) this.bootPromise = this.boot();
    try {
      this.container = await this.bootPromise;
      return this.container;
    } catch (error) {
      this.bootPromise = undefined;
      throw error;
    }
  }

  private async startPreview(
    container: RuntimeContainer,
    command: string,
    args: string[],
    generation: number,
  ): Promise<void> {
    this.emit({ type: "state", state: "starting" });
    let settled = false;
    let resolveReady: (() => void) | undefined;
    const readyPromise = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });
    this.unsubscribeReady?.();
    this.unsubscribeError?.();
    this.unsubscribeReady = container.on("server-ready", (port, url) => {
      if (generation !== this.generation || settled) return;
      if (isStoragePartitioningErrorUrl(url)) {
        settled = true;
        this.emit({ type: "state", state: "error", error: "storage-partitioning-required" });
        resolveReady?.();
        return;
      }
      settled = true;
      this.emit({ type: "server-ready", port, url });
      this.emit({ type: "state", state: "ready" });
      resolveReady?.();
    });
    this.unsubscribeError = (
      container as unknown as {
        on: (event: "error", listener: (error: { message: string }) => void) => () => void;
      }
    ).on("error", (error) => {
      if (generation !== this.generation || settled) return;
      const runtimeError = getRuntimeError(error);
      if (runtimeError !== "storage-partitioning-required") return;
      settled = true;
      this.emit({ type: "state", state: "error", error: runtimeError });
      resolveReady?.();
    });

    const process = await withTimeout(container.spawn(command, args), 15_000);
    this.process = process;
    void consumeOutput(process, this.listener);
    const exit = process.exit.then(() => {
      if (generation === this.generation && !settled) {
        this.emit({ type: "state", state: "error", error: "start-failed" });
      }
    });
    await Promise.race([readyPromise, exit]);
  }

  private stopProcess(): void {
    this.process?.kill();
    this.process = undefined;
  }

  private emit(event: RuntimeEvent): void {
    this.listener?.(event);
  }
}

function defaultBoot(): Promise<RuntimeContainer> {
  if (typeof window !== "undefined" && !window.crossOriginIsolated) {
    return Promise.reject(new Error("cross-origin-isolation-required"));
  }
  return WebContainer.boot({ forwardPreviewErrors: true }) as unknown as Promise<RuntimeContainer>;
}

export function isStoragePartitioningErrorUrl(url: string): boolean {
  return /localservice@sw-install-error/i.test(url);
}

function createSnapshot(files: ProjectFile[], folders: string[]): Snapshot {
  const fileMap = new Map(files.map((file) => [file.path, file.text.toString()]));
  const folderSet = new Set(folders);
  for (const path of fileMap.keys()) {
    const segments = path.split("/").slice(0, -1);
    for (let index = 1; index <= segments.length; index += 1) {
      folderSet.add(segments.slice(0, index).join("/"));
    }
  }
  return { files: fileMap, folders: folderSet };
}

async function consumeOutput(
  process: RuntimeProcess,
  listener: ((event: RuntimeEvent) => void) | undefined,
): Promise<void> {
  const reader = process.output.getReader();
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) return;
      const message = stripAnsi(result.value).trim();
      if (message) listener?.({ type: "output", level: classifyOutput(message), message });
    }
  } finally {
    reader.releaseLock();
  }
}

function classifyOutput(message: string): "log" | "warn" | "error" {
  if (/\b(error|err!)\b/i.test(message)) return "error";
  if (/\b(warn|warning)\b/i.test(message)) return "warn";
  return "log";
}

function stripAnsi(value: string): string {
  const escape = String.fromCharCode(27);
  return value.replace(new RegExp(`${escape}\\[[0-?]*[ -/]*[@-~]`, "g"), "");
}

function toContainerPath(path: string): string {
  return `/${path}`;
}

export function getRuntimeError(error: unknown): RuntimeError {
  if (error instanceof Error) {
    if (isStoragePartitioningErrorMessage(error.message)) return "storage-partitioning-required";
    if (isRuntimeError(error.message)) return error.message;
  }
  return "runtime-unavailable";
}

function isStoragePartitioningErrorMessage(message: string): boolean {
  return /storage[ -]partition(?:ing)?|third[- ]party storage/i.test(message);
}

function getInstallCommand(packageManager: PackageManager): [string, string[]] {
  if (packageManager === "npm") return ["npm", ["install", "--no-audit", "--no-fund"]];
  if (packageManager === "yarn") return ["yarn", ["install", "--non-interactive"]];
  return ["pnpm", ["install", "--reporter=append-only"]];
}

function isRuntimeError(value: string): value is RuntimeError {
  return [
    "cross-origin-isolation-required",
    "storage-partitioning-required",
    "invalid-package-json",
    "missing-package-json",
    "missing-preview-script",
    "install-failed",
    "start-failed",
    "runtime-unavailable",
  ].includes(value);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("runtime-unavailable")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
