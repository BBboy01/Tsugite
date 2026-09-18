import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PreviewOutput } from "./preview-runner";
import {
  type RuntimeError,
  type RuntimeEvent,
  type RuntimeState,
  isStoragePartitioningErrorUrl,
} from "./webcontainer-runtime";
import type { RuntimeAction } from "./runtime-actions";
import type { PreviewPaneProps } from "../components/preview-pane.types";
import { getRuntimeSettingsKey } from "./preview-runtime-model";
type WebContainerRuntimeInstance = import("./webcontainer-runtime").WebContainerRuntime;

export function usePreviewRuntime({ file, files, folders, settings }: PreviewPaneProps) {
  const { t } = useTranslation();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [outputs, setOutputs] = useState<PreviewOutput[]>([]);
  const [runtimeState, setRuntimeState] = useState<RuntimeState>("idle");
  const [runtimeError, setRuntimeError] = useState<RuntimeError | undefined>();
  const [previewUrl, setPreviewUrl] = useState<string | undefined>();
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [previewLoadKey, setPreviewLoadKey] = useState(0);
  const [fallbackDocument, setFallbackDocument] = useState("");
  const [previewBuildError, setPreviewBuildError] = useState<string>();
  const [runKey, setRunKey] = useState(0);
  const [contentRevision, setContentRevision] = useState(0);
  const runtimeRef = useRef<WebContainerRuntimeInstance | undefined>(undefined);
  const runtimeStartedRef = useRef(false);
  const syntaxErrorActiveRef = useRef(false);
  const lastRunKeyRef = useRef(runKey);
  const lastRuntimeSettingsKeyRef = useRef("");
  const latestProjectRef = useRef({ files, folders });
  const translateRef = useRef(t);
  const runtimeEventRef = useRef<(event: RuntimeEvent) => void>(() => undefined);
  const stableRuntimeHandlerRef = useRef((event: RuntimeEvent) => runtimeEventRef.current(event));
  const manualRuntimeActionRef = useRef<RuntimeAction | undefined>(undefined);
  latestProjectRef.current = { files, folders };
  translateRef.current = t;
  useEffect(() => {
    const unsubscribe = files.map((item) =>
      item.text.subscribe(() => setContentRevision((revision) => revision + 1)),
    );
    return () => unsubscribe.forEach((stop) => stop());
  }, [files]);
  useEffect(() => {
    const handleMessage = (event: MessageEvent<PreviewOutput & { source?: string }>) => {
      if (event.source !== iframeRef.current?.contentWindow || event.data.source !== "iris-preview")
        return;
      setOutputs((current) =>
        [...current, { level: event.data.level, message: event.data.message }].slice(-80),
      );
      if (event.data.level === "error") setRuntimeState("error");
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);
  useEffect(() => {
    return () => runtimeRef.current?.dispose();
  }, []);

  useEffect(() => {
    const handleRuntimeAction = (event: Event) => {
      const action = (event as CustomEvent<{ action?: RuntimeAction }>).detail?.action;
      if (action !== "restart" && action !== "reinstall") return;
      manualRuntimeActionRef.current = action;
      setRunKey((value) => value + 1);
    };
    window.addEventListener("iris:runtime-action", handleRuntimeAction);
    return () => window.removeEventListener("iris:runtime-action", handleRuntimeAction);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const packageFile = files.find((item) => item.path === "package.json");
    if (!packageFile) {
      const fallbackTimer = setTimeout(() => {
        void (async () => {
          try {
            const { createPreviewDocument, runPreview } = await import("./preview-runner");
            if (cancelled) return;
            const result = runPreview(file.text.toString(), file.language);
            if (cancelled) return;
            if (result.error) {
              setFallbackDocument("");
              setOutputs([{ level: "error", message: result.error }]);
              setPreviewBuildError(result.error);
              setRuntimeState("error");
              return;
            }
            setFallbackDocument(createPreviewDocument(result.code ?? ""));
          } catch (error) {
            if (cancelled) return;
            setFallbackDocument("");
            setOutputs([
              {
                level: "error",
                message: error instanceof Error ? error.message : String(error),
              },
            ]);
            setPreviewBuildError(error instanceof Error ? error.message : String(error));
            setRuntimeState("error");
          }
        })();
      }, 250);
      runtimeRef.current?.dispose();
      runtimeStartedRef.current = false;
      setRuntimeState("idle");
      setRuntimeError(undefined);
      setPreviewBuildError(undefined);
      setPreviewLoaded(false);
      setPreviewUrl(undefined);
      return () => {
        cancelled = true;
        clearTimeout(fallbackTimer);
      };
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const setupRuntime = async () => {
      if (!runtimeRef.current) {
        const { WebContainerRuntime } = await import("./webcontainer-runtime");
        if (cancelled) return;
        runtimeRef.current = new WebContainerRuntime();
      }
      const runtime = runtimeRef.current;
      if (!runtime || cancelled) return;
      if (runtimeStartedRef.current) {
        const { validateSourceSyntax } = await import("./preview-runner");
        const syntaxError = validateSourceSyntax(file.text.toString(), file.language);
        if (cancelled) return;
        if (syntaxError) {
          syntaxErrorActiveRef.current = true;
          setRuntimeState("error");
          setPreviewBuildError(syntaxError);
          setOutputs([{ level: "error", message: syntaxError }]);
          return;
        }
        if (syntaxErrorActiveRef.current) {
          syntaxErrorActiveRef.current = false;
          setRuntimeError(undefined);
          setRuntimeState("ready");
          setPreviewBuildError(undefined);
          setOutputs([]);
        }
      }
      const onRuntimeEvent = (event: RuntimeEvent) => {
        if (cancelled) return;
        if (event.type === "output") {
          setOutputs((current) => [...current, event].slice(-80));
          if (event.level === "error") {
            setPreviewBuildError(event.message);
            setRuntimeState("error");
          }
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
          setPreviewLoaded(false);
          setPreviewUrl(undefined);
          const runtimeMessage = translateRef.current(`preview.runtime.${event.error}`, {
            manager: settings.packageManager,
          });
          setPreviewBuildError(runtimeMessage);
          setOutputs((current) =>
            [
              ...current,
              {
                level: "error" as const,
                message: runtimeMessage,
              },
            ].slice(-80),
          );
        }
      };
      runtimeEventRef.current = onRuntimeEvent;
      timer = setTimeout(() => {
        const runtimeSettingsKey = getRuntimeSettingsKey(settings);
        const manualAction = manualRuntimeActionRef.current;
        if (manualAction) {
          manualRuntimeActionRef.current = undefined;
          lastRunKeyRef.current = runKey;
          runtimeStartedRef.current = true;
          setPreviewLoaded(false);
          setPreviewUrl(undefined);
          setOutputs([]);
          setRuntimeError(undefined);
          setPreviewBuildError(undefined);
          void runtime
            .restart(files, folders, stableRuntimeHandlerRef.current, settings, {
              forceStart: true,
              forceInstall: manualAction === "reinstall",
            })
            .then(() => {
              window.dispatchEvent(
                new CustomEvent("iris:runtime-action-complete", {
                  detail: { action: manualAction },
                }),
              );
            });
          return;
        }
        if (!runtimeStartedRef.current) {
          runtimeStartedRef.current = true;
          lastRunKeyRef.current = runKey;
          lastRuntimeSettingsKeyRef.current = runtimeSettingsKey;
          setOutputs([]);
          setRuntimeError(undefined);
          setPreviewBuildError(undefined);
          void runtime
            .start(files, folders, stableRuntimeHandlerRef.current, settings, {
              forceStart: runKey > 0,
            })
            .then(() => {
              const latest = latestProjectRef.current;
              void runtime.sync(latest.files, latest.folders);
            });
          return;
        }
        if (runtimeSettingsKey !== lastRuntimeSettingsKeyRef.current) {
          lastRuntimeSettingsKeyRef.current = runtimeSettingsKey;
          setOutputs([]);
          setRuntimeError(undefined);
          setPreviewBuildError(undefined);
          void runtime.restart(files, folders, stableRuntimeHandlerRef.current, settings);
          return;
        }
        if (runKey !== lastRunKeyRef.current) {
          lastRunKeyRef.current = runKey;
          setOutputs([]);
          setRuntimeError(undefined);
          setPreviewBuildError(undefined);
          void runtime.restart(files, folders, stableRuntimeHandlerRef.current, settings, {
            forceStart: true,
          });
          return;
        }
        void runtime.sync(files, folders).then(({ packageChanged }) => {
          if (!packageChanged || cancelled) return;
          setOutputs([]);
          setRuntimeError(undefined);
          setPreviewBuildError(undefined);
          void runtime.restart(
            latestProjectRef.current.files,
            latestProjectRef.current.folders,
            stableRuntimeHandlerRef.current,
            settings,
          );
        });
      }, 250);
    };
    void setupRuntime();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [
    contentRevision,
    file,
    files,
    folders,
    runKey,
    settings.autoInstall,
    settings.autoStartPreview,
    settings.packageManager,
  ]);

  const handlePreviewLoad = () => {
    if (previewUrl && isStoragePartitioningErrorUrl(previewUrl)) {
      const message = translateRef.current("preview.runtime.storage-partitioning-required");
      setPreviewLoaded(false);
      setRuntimeState("error");
      setRuntimeError("storage-partitioning-required");
      setPreviewBuildError(message);
      setOutputs((current) =>
        current.some((output) => output.message === message)
          ? current
          : [...current, { level: "error" as const, message }].slice(-80),
      );
      return;
    }
    window.setTimeout(() => setPreviewLoaded(true), 900);
  };

  const rerun = () => {
    setPreviewLoaded(false);
    setPreviewLoadKey((value) => value + 1);
    setRunKey((value) => value + 1);
    setPreviewBuildError(undefined);
  };
  const clearOutputs = () => setOutputs([]);
  return {
    outputs,
    runtimeState,
    runtimeError,
    previewUrl,
    previewLoaded,
    previewLoadKey,
    fallbackDocument,
    previewBuildError,
    iframeRef,
    handlePreviewLoad,
    rerun,
    clearOutputs,
  };
}
