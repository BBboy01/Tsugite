import { WebContainer, type FileSystemTree } from "@webcontainer/api";

import type { PackageManager, ProjectFile } from "@iris/shared";

import { selectPreviewScript } from "./webcontainer-files";
import { WebContainerFileSync } from "./webcontainer-file-sync";
import {
  getRuntimeError,
  isStoragePartitioningErrorUrl,
  type RuntimeError,
} from "./webcontainer-errors";

export type RuntimeState = "idle" | "installing" | "starting" | "ready" | "paused" | "error";
export type RuntimeSettings = {
  packageManager: PackageManager;
  autoInstall: boolean;
  autoStartPreview: boolean;
};
export type { RuntimeError } from "./webcontainer-errors";

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
  on(event: "server-ready", listener: (port: number, url: string) => void): () => void;
  on(event: "error", listener: (error: { message: string }) => void): () => void;
  teardown: () => void;
};

type RuntimeOptions = {
  boot?: () => Promise<RuntimeContainer>;
  installTimeoutMs?: number;
  spawnTimeoutMs?: number;
};

type StartOptions = {
  forceStart?: boolean;
  forceInstall?: boolean;
};

const DEFAULT_RUNTIME_SETTINGS: RuntimeSettings = {
  packageManager: "pnpm",
  autoInstall: true,
  autoStartPreview: true,
};

export class WebContainerRuntime {
  private readonly boot: () => Promise<RuntimeContainer>;
  private readonly installTimeoutMs: number;
  private readonly spawnTimeoutMs: number;
  private container: RuntimeContainer | undefined;
  private bootPromise: Promise<RuntimeContainer> | undefined;
  private process: RuntimeProcess | undefined;
  private unsubscribeReady: (() => void) | undefined;
  private unsubscribeError: (() => void) | undefined;
  private fileSync: WebContainerFileSync | undefined;
  private listener: ((event: RuntimeEvent) => void) | undefined;
  private generation = 0;

  constructor(options: RuntimeOptions = {}) {
    this.boot = options.boot ?? defaultBoot;
    this.installTimeoutMs = options.installTimeoutMs ?? 120_000;
    this.spawnTimeoutMs = options.spawnTimeoutMs ?? 15_000;
  }

  async start(
    files: ProjectFile[],
    folders: string[],
    onEvent: (event: RuntimeEvent) => void,
    settings: RuntimeSettings = DEFAULT_RUNTIME_SETTINGS,
    options: StartOptions = {},
  ): Promise<void> {
    this.listener = onEvent;
    const generation = ++this.generation;
    this.stopCurrentRun();
    this.emit({ type: "state", state: "installing" });

    try {
      const container = await this.getContainer();
      if (generation !== this.generation || !this.fileSync) return;

      await this.fileSync.mount(
        files,
        folders,
        settings.packageManager,
        () => generation === this.generation,
      );
      if (generation !== this.generation) return;

      const packageFile = files.find((file) => file.path === "package.json");
      if (!packageFile) {
        this.emit({ type: "state", state: "error", error: "missing-package-json" });
        return;
      }

      if (settings.autoInstall || options.forceInstall) {
        const [installCommand, installArgs] = getInstallCommand(settings.packageManager);
        this.emit({ type: "output", level: "log", message: `${installCommand} install` });
        const install = await this.spawnProcess(
          container,
          installCommand,
          installArgs,
          generation,
          "install-failed",
        );
        if (!install) return;
        let installCode: number;
        try {
          installCode = await withTimeout(install.exit, this.installTimeoutMs, "install-failed");
        } catch (error) {
          install.kill();
          throw error;
        } finally {
          if (this.process === install) this.process = undefined;
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
      this.stopCurrentRun();
      this.emit({
        type: "state",
        state: "error",
        error: getRuntimeError(error),
      });
    }
  }

  async sync(files: ProjectFile[], folders: string[]): Promise<{ packageChanged: boolean }> {
    const generation = this.generation;
    return (
      this.fileSync?.sync(files, folders, () => generation === this.generation) ?? {
        packageChanged: false,
      }
    );
  }

  async syncChangedFiles(files: ProjectFile[]): Promise<{ packageChanged: boolean }> {
    const generation = this.generation;
    return (
      this.fileSync?.syncChangedFiles(files, () => generation === this.generation) ?? {
        packageChanged: false,
      }
    );
  }

  async restart(
    files: ProjectFile[],
    folders: string[],
    onEvent: (event: RuntimeEvent) => void,
    settings: RuntimeSettings = DEFAULT_RUNTIME_SETTINGS,
    options: StartOptions = {},
  ): Promise<void> {
    await this.start(files, folders, onEvent, settings, options);
  }

  dispose(): void {
    this.generation += 1;
    this.stopCurrentRun();
    this.container?.teardown();
    this.container = undefined;
    this.bootPromise = undefined;
    this.fileSync = undefined;
    this.listener = undefined;
  }

  private async getContainer(): Promise<RuntimeContainer> {
    if (this.container) return this.container;
    if (!this.bootPromise) {
      const bootPromise = this.boot().then(
        (container) => {
          if (this.bootPromise === bootPromise) {
            this.container = container;
            this.fileSync = new WebContainerFileSync(container);
          } else container.teardown();
          return container;
        },
        (error: unknown) => {
          if (this.bootPromise === bootPromise) this.bootPromise = undefined;
          throw error;
        },
      );
      this.bootPromise = bootPromise;
    }
    return this.bootPromise;
  }

  private async startPreview(
    container: RuntimeContainer,
    command: string,
    args: string[],
    generation: number,
  ): Promise<void> {
    this.emit({ type: "state", state: "starting" });
    let phase: "starting" | "ready" | "failed" = "starting";
    let resolveReady: (() => void) | undefined;
    const readyPromise = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });
    this.unsubscribeReady = container.on("server-ready", (port, url) => {
      if (generation !== this.generation || phase !== "starting") return;
      if (isStoragePartitioningErrorUrl(url)) {
        phase = "failed";
        this.emit({ type: "state", state: "error", error: "storage-partitioning-required" });
        resolveReady?.();
        return;
      }
      phase = "ready";
      this.emit({ type: "server-ready", port, url });
      this.emit({ type: "state", state: "ready" });
      resolveReady?.();
    });
    this.unsubscribeError = container.on("error", (error) => {
      if (generation !== this.generation || phase === "failed") return;
      const runtimeError = phase === "starting" ? getRuntimeError(error) : "start-failed";
      phase = "failed";
      if (runtimeError !== "storage-partitioning-required") {
        this.emit({
          type: "output",
          level: "error",
          message: error.message || "Preview runtime error",
        });
        this.emit({ type: "state", state: "error", error: "start-failed" });
        resolveReady?.();
        return;
      }
      this.emit({ type: "state", state: "error", error: runtimeError });
      resolveReady?.();
    });

    const process = await this.spawnProcess(container, command, args, generation, "start-failed");
    if (!process) return;
    const failProcess = (error: RuntimeError) => {
      if (generation === this.generation && phase !== "failed") {
        phase = "failed";
        this.stopCurrentRun();
        this.emit({ type: "state", state: "error", error });
      }
    };
    const exit = process.exit.then(
      () => failProcess(phase === "ready" ? "server-exited" : "start-failed"),
      (error: unknown) => failProcess(getRuntimeError(error)),
    );
    await Promise.race([readyPromise, exit]);
  }

  private async spawnProcess(
    container: RuntimeContainer,
    command: string,
    args: string[],
    generation: number,
    error: RuntimeError,
  ): Promise<RuntimeProcess | undefined> {
    let pending = true;
    try {
      const process = await withTimeout(
        container.spawn(command, args).then((spawned) => {
          if (!pending) spawned.kill();
          return spawned;
        }),
        this.spawnTimeoutMs,
        error,
      );
      if (generation !== this.generation) {
        process.kill();
        return;
      }
      this.process = process;
      void consumeOutput(process, (event) => {
        if (generation === this.generation) this.emit(event);
      });
      return process;
    } finally {
      pending = false;
    }
  }

  private stopCurrentRun(): void {
    this.process?.kill();
    this.process = undefined;
    this.unsubscribeReady?.();
    this.unsubscribeReady = undefined;
    this.unsubscribeError?.();
    this.unsubscribeError = undefined;
  }

  private emit(event: RuntimeEvent): void {
    this.listener?.(event);
  }
}

function defaultBoot(): Promise<RuntimeContainer> {
  if (typeof window !== "undefined" && !window.crossOriginIsolated) {
    return Promise.reject(new Error("cross-origin-isolation-required"));
  }
  return WebContainer.boot({ forwardPreviewErrors: true });
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
  } catch (error) {
    listener?.({
      type: "output",
      level: "warn",
      message: error instanceof Error ? error.message : "Preview output stream closed unexpectedly",
    });
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

export { getRuntimeError, isStoragePartitioningErrorUrl } from "./webcontainer-errors";

function getInstallCommand(packageManager: PackageManager): [string, string[]] {
  if (packageManager === "npm") return ["npm", ["install", "--no-audit", "--no-fund"]];
  if (packageManager === "yarn") return ["yarn", ["install", "--non-interactive"]];
  return ["pnpm", ["install", "--reporter=append-only"]];
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  error: RuntimeError = "runtime-unavailable",
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(error)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
