import type { ProjectFile } from "@iris/shared";
import type { PendingPreviewChange } from "./preview-content-changes";
import type { RuntimeAction } from "./runtime-actions";
import type { PreviewOutput, PreviewSyntaxError } from "./preview-runner";
import type {
  RuntimeError,
  RuntimeEvent,
  RuntimeSettings,
  WebContainerRuntime,
} from "./webcontainer-runtime";
import type { ProjectDeclarations } from "./room-typescript-intelligence";
import { PreviewTypeScriptDeclarations } from "./preview-typescript-declarations";
import { getRuntimeSettingsKey } from "./preview-runtime-model";
import { getRuntimeError } from "./webcontainer-errors";
import {
  appendPreviewOutput,
  initialPreviewWebContainerState,
  type PreviewWebContainerState,
} from "./preview-webcontainer-state";

export type PreviewRuntimePort = Pick<
  WebContainerRuntime,
  | "start"
  | "restart"
  | "sync"
  | "syncChangedFiles"
  | "readTypeScriptDeclarations"
  | "dispose"
>;
export type PreviewRuntimeInput = {
  enabled: boolean;
  file: ProjectFile;
  files: ProjectFile[];
  folders: string[];
  settings: RuntimeSettings;
  runKey: number;
  acknowledgeContentChanges: (changes: PendingPreviewChange[]) => void;
  getPendingContentChanges: () => PendingPreviewChange[];
  translateError: (error: RuntimeError) => string;
};
type SyntaxValidator = (
  source: string,
  language: ProjectFile["language"],
  path?: string,
) => PreviewSyntaxError | undefined;
type SchedulerOptions = {
  createRuntime?: () => Promise<PreviewRuntimePort>;
  loadSyntaxValidator?: () => Promise<SyntaxValidator>;
  completeAction?: (action: RuntimeAction) => void;
  debounceMs?: number;
  declarations?: ProjectDeclarations;
};

type RuntimeCommand =
  | { type: "start"; forceStart: boolean }
  | {
      type: "restart";
      forceStart: boolean;
      forceInstall?: boolean;
      action?: RuntimeAction;
    }
  | { type: "sync"; full: boolean };

export class PreviewWebContainerScheduler {
  private state = initialPreviewWebContainerState();
  private readonly listeners = new Set<() => void>();
  private readonly declarationSync: PreviewTypeScriptDeclarations | undefined;
  private input: PreviewRuntimeInput | undefined;
  private runtime: PreviewRuntimePort | undefined;
  private runtimeLoad: Promise<PreviewRuntimePort | undefined> | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private preflightGeneration = 0;
  private runtimeGeneration = 0;
  private sessionGeneration = 0;
  private started = false;
  private syntaxErrorActive = false;
  private lastRunKey = 0;
  private settingsKey = "";
  private syncedStructureKey: string | undefined;
  private packageRevision = 0;
  private restartedPackageRevision = 0;
  private manualAction: RuntimeAction | undefined;

  constructor(private readonly options: SchedulerOptions = {}) {
    this.declarationSync =
      options.declarations &&
      new PreviewTypeScriptDeclarations(options.declarations);
  }

  getSnapshot = () => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  update(input: PreviewRuntimeInput): void {
    this.input = input;
    this.cancelPending();
    if (!input.enabled) {
      this.dispose();
      return;
    }
    const generation = this.preflightGeneration;
    void Promise.all([
      this.ensureRuntime(),
      this.options.loadSyntaxValidator?.() ??
        import("./preview-runner").then(
          (module) => module.validateSourceSyntaxDetails,
        ),
    ])
      .then(([runtime, validate]) => {
        if (!runtime || generation !== this.preflightGeneration) return;
        this.timer = setTimeout(() => {
          this.timer = undefined;
          if (generation !== this.preflightGeneration) return;
          this.preflight(input, runtime, validate);
        }, this.options.debounceMs ?? 250);
      })
      .catch((error: unknown) => {
        if (generation === this.preflightGeneration) this.reportFailure(error);
      });
  }

  cancelPending(): void {
    this.preflightGeneration++;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  requestAction(action: RuntimeAction): void {
    this.manualAction = action;
  }

  setPreviewLoaded = (previewLoaded: boolean): void =>
    this.patch({ previewLoaded });
  setPreviewUrl = (previewUrl: string | undefined): void =>
    this.patch({ previewUrl });
  clearOutputs = (): void => this.patch({ outputs: [] });
  prepareRerun = (): void => this.patch({ buildError: undefined });

  addOutput = (output: PreviewOutput): void => {
    this.patch({
      outputs: appendPreviewOutput(this.state.outputs, output),
      ...(output.level === "error"
        ? { runtimeState: "error", buildError: output.message }
        : {}),
    });
  };

  reportIframeError = (message: string, runtimeError?: RuntimeError): void => {
    this.patch({
      runtimeState: "error",
      runtimeError,
      buildError: message,
      previewLoaded: false,
      outputs: this.state.outputs.some((output) => output.message === message)
        ? this.state.outputs
        : appendPreviewOutput(this.state.outputs, { level: "error", message }),
    });
  };

  dispose(): void {
    this.cancelPending();
    this.sessionGeneration++;
    this.runtimeGeneration++;
    this.runtime?.dispose();
    this.runtime = undefined;
    this.runtimeLoad = undefined;
    this.input = undefined;
    this.started = false;
    this.syntaxErrorActive = false;
    this.settingsKey = "";
    this.syncedStructureKey = undefined;
    this.restartedPackageRevision = this.packageRevision;
    this.manualAction = undefined;
    void this.declarationSync?.clear();
    this.state = initialPreviewWebContainerState();
    this.notify();
  }

  private ensureRuntime(): Promise<PreviewRuntimePort | undefined> {
    if (this.runtime) return Promise.resolve(this.runtime);
    if (!this.runtimeLoad) {
      const generation = this.sessionGeneration;
      const create =
        this.options.createRuntime ??
        (async () => {
          const { WebContainerRuntime } =
            await import("./webcontainer-runtime");
          return generation === this.sessionGeneration
            ? new WebContainerRuntime()
            : undefined;
        });
      const pending = create()
        .then((runtime) => {
          if (!runtime) return undefined;
          if (generation !== this.sessionGeneration) {
            runtime.dispose();
            return undefined;
          }
          this.runtime = runtime;
          return runtime;
        })
        .finally(() => {
          if (this.runtimeLoad === pending) this.runtimeLoad = undefined;
        });
      this.runtimeLoad = pending;
    }
    return this.runtimeLoad;
  }

  private preflight(
    input: PreviewRuntimeInput,
    runtime: PreviewRuntimePort,
    validate: SyntaxValidator,
  ): void {
    const source = input.file.text.toString();
    const error = validate(source, input.file.language, input.file.path);
    if (error) {
      this.syntaxErrorActive = true;
      this.patch({
        runtimeState: "error",
        runtimeError: undefined,
        outputs: [{ level: "error", message: error.message }],
        sourceError: {
          path: input.file.path,
          source,
          location: error.location,
        },
        buildError: error.message,
      });
      return;
    }
    if (this.syntaxErrorActive) {
      this.syntaxErrorActive = false;
      this.patch({
        runtimeState: this.started ? "ready" : "idle",
        runtimeError: undefined,
        sourceError: undefined,
        buildError: undefined,
        outputs: [],
      });
    }
    const command = this.chooseCommand(input);
    if (!command) return;
    const preflightGeneration = this.preflightGeneration;
    const generation =
      command.type === "sync"
        ? this.runtimeGeneration
        : ++this.runtimeGeneration;
    void this.execute(command, input, runtime, generation).catch(
      (failure: unknown) => {
        if (
          preflightGeneration === this.preflightGeneration &&
          this.isCurrent(runtime, generation)
        )
          this.reportFailure(failure);
      },
    );
  }

  private chooseCommand(
    input: PreviewRuntimeInput,
  ): RuntimeCommand | undefined {
    if (this.manualAction) {
      const action = this.manualAction;
      this.manualAction = undefined;
      return {
        type: "restart",
        forceStart: true,
        forceInstall: action === "reinstall",
        action,
      };
    }
    if (!this.started) return { type: "start", forceStart: input.runKey > 0 };
    const forceStart = input.runKey !== this.lastRunKey;
    if (
      forceStart ||
      this.settingsKey !== getRuntimeSettingsKey(input.settings) ||
      this.packageRevision !== this.restartedPackageRevision
    ) {
      return { type: "restart", forceStart };
    }
    const full = this.syncedStructureKey !== getStructureKey(input);
    if (full || input.getPendingContentChanges().length > 0)
      return { type: "sync", full };
  }

  private async execute(
    command: RuntimeCommand,
    input: PreviewRuntimeInput,
    runtime: PreviewRuntimePort,
    generation: number,
  ): Promise<void> {
    if (command.type === "sync") {
      await this.sync(runtime, input, generation, command.full);
      return;
    }
    this.started = true;
    this.lastRunKey = input.runKey;
    this.settingsKey = getRuntimeSettingsKey(input.settings);
    this.restartedPackageRevision = this.packageRevision;
    this.patch({
      outputs: [],
      runtimeError: undefined,
      buildError: undefined,
      sourceError: undefined,
      previewLoaded: false,
      previewUrl: undefined,
    });
    const listener = (event: RuntimeEvent) => {
      if (this.isCurrent(runtime, generation) && !this.syntaxErrorActive)
        this.onEvent(event, runtime, input);
    };
    if (command.type === "start") {
      await runtime.start(
        input.files,
        input.folders,
        listener,
        input.settings,
        {
          forceStart: command.forceStart,
        },
      );
      if (this.isCurrent(runtime, generation) && this.input)
        await this.sync(runtime, this.input, generation, true);
      return;
    }
    const pending = input.getPendingContentChanges();
    try {
      await runtime.restart(
        input.files,
        input.folders,
        listener,
        input.settings,
        {
          forceStart: command.forceStart,
          ...(command.forceInstall !== undefined
            ? { forceInstall: command.forceInstall }
            : {}),
        },
      );
      if (!this.isCurrent(runtime, generation)) return;
      input.acknowledgeContentChanges(pending);
      this.syncedStructureKey = getStructureKey(input);
    } finally {
      if (command.action) this.options.completeAction?.(command.action);
    }
  }

  private async sync(
    runtime: PreviewRuntimePort,
    input: PreviewRuntimeInput,
    generation: number,
    full: boolean,
  ): Promise<void> {
    const pending = input.getPendingContentChanges();
    const result = full
      ? await runtime.sync(input.files, input.folders)
      : await runtime.syncChangedFiles(pending.map(({ file }) => file));
    if (!this.isCurrent(runtime, generation)) return;
    input.acknowledgeContentChanges(pending);
    this.syncedStructureKey = getStructureKey(input);
    if (result.packageChanged) {
      this.packageRevision++;
      if (this.input) this.update(this.input);
    } else {
      void this.declarationSync?.syncSources(
        runtime,
        input.files.map(({ path, text }) => ({ path, text: text.toString() })),
      );
    }
  }

  private onEvent(
    event: RuntimeEvent,
    runtime: PreviewRuntimePort,
    input: PreviewRuntimeInput,
  ): void {
    if (event.type === "output") {
      this.addOutput(event);
    } else if (event.type === "server-ready") {
      this.patch({ previewLoaded: false, previewUrl: event.url });
    } else {
      this.patch({ runtimeState: event.state, runtimeError: event.error });
      void this.declarationSync?.onRuntimeState(
        event.state,
        runtime,
        event.error,
      );
      if (event.error) {
        const message = (this.input ?? input).translateError(event.error);
        this.patch({
          sourceError: undefined,
          previewLoaded: false,
          previewUrl: undefined,
          buildError: message,
          outputs: appendPreviewOutput(this.state.outputs, {
            level: "error",
            message,
          }),
        });
      }
    }
  }

  private reportFailure(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.patch({
      runtimeState: "error",
      runtimeError: getRuntimeError(error),
      buildError: message,
      previewLoaded: false,
      previewUrl: undefined,
      outputs: appendPreviewOutput(this.state.outputs, {
        level: "error",
        message,
      }),
    });
    void this.options.declarations?.clearDeclarations(message);
  }

  private isCurrent(runtime: PreviewRuntimePort, generation: number): boolean {
    return this.runtime === runtime && this.runtimeGeneration === generation;
  }

  private patch(patch: Partial<PreviewWebContainerState>): void {
    this.state = { ...this.state, ...patch };
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

function getStructureKey({ files, folders }: PreviewRuntimeInput): string {
  return JSON.stringify([files.map(({ id, path }) => [id, path]), folders]);
}
