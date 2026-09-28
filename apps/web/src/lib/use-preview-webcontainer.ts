import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectFile, ProjectSettings } from "@iris/shared";
import type { TFunction } from "i18next";
import type { PreviewOutput } from "./preview-runner";
import type { RuntimeAction } from "./runtime-actions";
import type { PendingPreviewChange } from "./preview-content-changes";
import { runRuntimeAction, subscribeRuntimeAction } from "./runtime-actions";
import type { RuntimeError, RuntimeEvent, RuntimeState } from "./webcontainer-runtime";
import type { PreviewSourceError } from "./preview-error-model";
import { getRuntimeError } from "./webcontainer-errors";
import { getRuntimeSettingsKey } from "./preview-runtime-model";

type WebContainerRuntimeInstance = import("./webcontainer-runtime").WebContainerRuntime;

export function usePreviewWebContainer({
  enabled,
  file,
  files,
  folders,
  settings,
  contentRevision,
  contentChanges,
  acknowledgeContentChanges,
  getPendingContentChanges,
  runKey,
  requestRun,
  translate,
}: {
  enabled: boolean;
  file: ProjectFile;
  files: ProjectFile[];
  folders: string[];
  settings: ProjectSettings;
  contentRevision: number;
  contentChanges: PendingPreviewChange[];
  acknowledgeContentChanges: (changes: PendingPreviewChange[]) => void;
  getPendingContentChanges: () => PendingPreviewChange[];
  runKey: number;
  requestRun: () => void;
  translate: TFunction;
}) {
  const [outputs, setOutputs] = useState<PreviewOutput[]>([]);
  const [runtimeState, setRuntimeState] = useState<RuntimeState>("idle");
  const [runtimeError, setRuntimeError] = useState<RuntimeError | undefined>(undefined);
  const [buildError, setBuildError] = useState<string | undefined>(undefined);
  const [sourceError, setSourceError] = useState<PreviewSourceError | undefined>(undefined);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [packageSyncRevision, setPackageSyncRevision] = useState(0);
  const runtimeRef = useRef<WebContainerRuntimeInstance | undefined>(undefined);
  const runtimeStartedRef = useRef(false);
  const syntaxErrorActiveRef = useRef(false);
  const lastRunKeyRef = useRef(runKey);
  const lastRuntimeSettingsKeyRef = useRef("");
  const lastRestartedPackageRevisionRef = useRef(0);
  const structureKey = useMemo(() => getStructureKey(files, folders), [files, folders]);
  const latestProjectRef = useRef({ files, folders, structureKey });
  const lastSyncedStructureKeyRef = useRef<string | undefined>(undefined);
  const translateRef = useRef(translate);
  const runtimeEventRef = useRef<(event: RuntimeEvent) => void>(() => undefined);
  const stableRuntimeHandlerRef = useRef((event: RuntimeEvent) => runtimeEventRef.current(event));
  const manualRuntimeActionRef = useRef<RuntimeAction | undefined>(undefined);
  latestProjectRef.current = { files, folders, structureKey };
  translateRef.current = translate;

  useEffect(
    () => () => {
      runtimeRef.current?.dispose();
      runtimeRef.current = undefined;
    },
    [],
  );

  useEffect(() => {
    if (!enabled) {
      runtimeRef.current?.dispose();
      runtimeRef.current = undefined;
      runtimeStartedRef.current = false;
      syntaxErrorActiveRef.current = false;
      lastRuntimeSettingsKeyRef.current = "";
      lastRestartedPackageRevisionRef.current = packageSyncRevision;
      manualRuntimeActionRef.current = undefined;
      setRuntimeState("idle");
      setRuntimeError(undefined);
      setBuildError(undefined);
      setSourceError(undefined);
      setPreviewUrl(undefined);
      setPreviewLoaded(false);
      setOutputs([]);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    runtimeEventRef.current = (event) => {
      if (cancelled || syntaxErrorActiveRef.current) return;
      if (event.type === "output") {
        setOutputs((current) => appendOutput(current, event));
        if (event.level === "error") setRuntimeState("error");
        if (event.level === "error") setBuildError(event.message);
        return;
      }
      if (event.type === "server-ready") {
        setPreviewLoaded(false);
        setPreviewUrl(event.url);
        return;
      }
      setRuntimeState(event.state);
      setRuntimeError(event.error);
      if (event.error) {
        setSourceError(undefined);
        setPreviewLoaded(false);
        setPreviewUrl(undefined);
        const message = translateRef.current(`preview.runtime.${event.error}`, {
          manager: settings.packageManager,
        });
        setBuildError(message);
        setOutputs((current) => appendOutput(current, { level: "error", message }));
      }
    };
    const reportRuntimeFailure = (error: unknown) => {
      if (cancelled) return;
      const message = error instanceof Error ? error.message : String(error);
      setRuntimeState("error");
      setRuntimeError(getRuntimeError(error));
      setBuildError(message);
      setPreviewLoaded(false);
      setPreviewUrl(undefined);
      setOutputs((current) => appendOutput(current, { level: "error", message }));
    };
    const setupRuntime = async () => {
      if (!runtimeRef.current) {
        const { WebContainerRuntime } = await import("./webcontainer-runtime");
        if (cancelled) return;
        runtimeRef.current = new WebContainerRuntime();
      }
      const runtime = runtimeRef.current;
      if (!runtime || cancelled) return;
      const { validateSourceSyntaxDetails } = await import("./preview-runner");
      if (cancelled) return;
      timer = setTimeout(() => {
        if (cancelled) return;
        const source = file.text.toString();
        const syntaxError = validateSourceSyntaxDetails(source, file.language, file.path);
        if (cancelled) return;
        if (syntaxError) {
          syntaxErrorActiveRef.current = true;
          setRuntimeState("error");
          setOutputs([{ level: "error", message: syntaxError.message }]);
          setRuntimeError(undefined);
          setSourceError({ path: file.path, source, location: syntaxError.location });
          setBuildError(syntaxError.message);
          return;
        }
        if (syntaxErrorActiveRef.current) {
          syntaxErrorActiveRef.current = false;
          setRuntimeError(undefined);
          setSourceError(undefined);
          setBuildError(undefined);
          setRuntimeState(runtimeStartedRef.current ? "ready" : "idle");
          setOutputs([]);
        }
        const runtimeSettingsKey = getRuntimeSettingsKey(settings);
        const manualAction = manualRuntimeActionRef.current;
        if (manualAction) {
          manualRuntimeActionRef.current = undefined;
          lastRuntimeSettingsKeyRef.current = runtimeSettingsKey;
          lastRestartedPackageRevisionRef.current = packageSyncRevision;
          lastRunKeyRef.current = runKey;
          runtimeStartedRef.current = true;
          resetRuntimeOutput();
          const latest = latestProjectRef.current;
          const pending = getPendingContentChanges();
          void runRuntimeAction(manualAction, () =>
            runtime.restart(
              latest.files,
              latest.folders,
              stableRuntimeHandlerRef.current,
              settings,
              {
                forceStart: true,
                forceInstall: manualAction === "reinstall",
              },
            ),
          )
            .then(() => {
              acknowledgeContentChanges(pending);
              lastSyncedStructureKeyRef.current = latest.structureKey;
            })
            .catch(reportRuntimeFailure);
          return;
        }
        if (!runtimeStartedRef.current) {
          runtimeStartedRef.current = true;
          lastRunKeyRef.current = runKey;
          lastRuntimeSettingsKeyRef.current = runtimeSettingsKey;
          resetRuntimeOutput();
          void runtime
            .start(files, folders, stableRuntimeHandlerRef.current, settings, {
              forceStart: runKey > 0,
            })
            .then(() => {
              if (runtimeRef.current !== runtime) return;
              const latest = latestProjectRef.current;
              const pending = getPendingContentChanges();
              return runtime.sync(latest.files, latest.folders).then(({ packageChanged }) => {
                if (runtimeRef.current !== runtime) return;
                acknowledgeContentChanges(pending);
                lastSyncedStructureKeyRef.current = latest.structureKey;
                if (packageChanged) setPackageSyncRevision((revision) => revision + 1);
              });
            })
            .catch(reportRuntimeFailure);
          return;
        }
        const forceStart = runKey !== lastRunKeyRef.current;
        if (
          runtimeSettingsKey !== lastRuntimeSettingsKeyRef.current ||
          packageSyncRevision !== lastRestartedPackageRevisionRef.current ||
          forceStart
        ) {
          lastRuntimeSettingsKeyRef.current = runtimeSettingsKey;
          lastRestartedPackageRevisionRef.current = packageSyncRevision;
          lastRunKeyRef.current = runKey;
          resetRuntimeOutput();
          const latest = latestProjectRef.current;
          const pending = getPendingContentChanges();
          void runtime
            .restart(latest.files, latest.folders, stableRuntimeHandlerRef.current, settings, {
              forceStart,
            })
            .then(() => {
              acknowledgeContentChanges(pending);
              lastSyncedStructureKeyRef.current = latest.structureKey;
            })
            .catch(reportRuntimeFailure);
          return;
        }
        const latest = latestProjectRef.current;
        const pending = getPendingContentChanges();
        const fullSync = lastSyncedStructureKeyRef.current !== latest.structureKey;
        const contentFiles = pending.map(({ file: changedFile }) => changedFile);
        if (!fullSync && contentFiles.length === 0) return;
        const sync = fullSync
          ? runtime.sync(latest.files, latest.folders)
          : runtime.syncChangedFiles(contentFiles);
        void sync
          .then(({ packageChanged }) => {
            if (runtimeRef.current !== runtime) return;
            acknowledgeContentChanges(pending);
            lastSyncedStructureKeyRef.current = latest.structureKey;
            // A completed write requests a restart; the latest preflight decides when it is safe.
            if (packageChanged) setPackageSyncRevision((revision) => revision + 1);
          })
          .catch(reportRuntimeFailure);
      }, 250);
    };
    const resetRuntimeOutput = () => {
      setOutputs([]);
      setRuntimeError(undefined);
      setBuildError(undefined);
      setSourceError(undefined);
      setPreviewLoaded(false);
      setPreviewUrl(undefined);
    };

    void setupRuntime().catch(reportRuntimeFailure);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [
    contentRevision,
    contentChanges,
    enabled,
    file,
    files,
    folders,
    runKey,
    packageSyncRevision,
    acknowledgeContentChanges,
    getPendingContentChanges,
    settings.autoInstall,
    settings.autoStartPreview,
    settings.packageManager,
  ]);

  useEffect(() => {
    return subscribeRuntimeAction((action) => {
      if (!enabled) return;
      manualRuntimeActionRef.current = action;
      requestRun();
    });
  }, [enabled, requestRun]);

  const reportIframeError = useCallback((message: string, error?: RuntimeError) => {
    setRuntimeState("error");
    setRuntimeError(error);
    setBuildError(message);
    setPreviewLoaded(false);
    setOutputs((current) =>
      current.some((output) => output.message === message)
        ? current
        : appendOutput(current, { level: "error", message }),
    );
  }, []);
  const addOutput = useCallback((output: PreviewOutput) => {
    setOutputs((current) => appendOutput(current, output));
    if (output.level === "error") setRuntimeState("error");
    if (output.level === "error") setBuildError(output.message);
  }, []);
  const clearOutputs = useCallback(() => setOutputs([]), []);
  const prepareRerun = useCallback(() => setBuildError(undefined), []);

  return {
    outputs,
    runtimeState,
    runtimeError,
    buildError,
    sourceError,
    previewUrl,
    previewLoaded,
    setPreviewLoaded,
    setPreviewUrl,
    addOutput,
    reportIframeError,
    clearOutputs,
    prepareRerun,
  };
}

function getStructureKey(files: ProjectFile[], folders: string[]): string {
  return JSON.stringify([files.map(({ id, path }) => [id, path]), folders]);
}

function appendOutput(outputs: PreviewOutput[], output: PreviewOutput): PreviewOutput[] {
  return [...outputs, output].slice(-80);
}
