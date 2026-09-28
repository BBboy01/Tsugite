import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PreviewOutput } from "./preview-runner";
import { isStoragePartitioningErrorUrl } from "./webcontainer-errors";
import type { PreviewPaneProps } from "../components/preview-pane.types";
import { getPreviewSourceLocation } from "./preview-error-model";
import { usePreviewStandalone } from "./use-preview-standalone";
import { usePreviewWebContainer } from "./use-preview-webcontainer";
import { PreviewContentChanges } from "./preview-content-changes";

export function usePreviewRuntime({ file, files, folders, settings }: PreviewPaneProps) {
  const { t } = useTranslation();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [previewLoadKey, setPreviewLoadKey] = useState(0);
  const [runKey, setRunKey] = useState(0);
  const [contentRevision, setContentRevision] = useState(0);
  const contentChangesRef = useRef(new PreviewContentChanges());
  const contentChanges = useMemo(() => contentChangesRef.current.pending(), [contentRevision]);
  const acknowledgeContentChanges = useCallback(
    (changes: typeof contentChanges) => contentChangesRef.current.acknowledge(changes),
    [],
  );
  const getPendingContentChanges = useCallback(() => contentChangesRef.current.pending(), []);
  const previewLoadTimerRef = useRef<number | undefined>(undefined);
  const requestRun = useCallback(() => setRunKey((value) => value + 1), []);
  const hasRuntime = files.some((item) => item.path === "package.json");
  const standalone = usePreviewStandalone(file, !hasRuntime, contentRevision, runKey);
  const webcontainer = usePreviewWebContainer({
    enabled: hasRuntime,
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
    translate: t,
  });
  const outputs = hasRuntime ? webcontainer.outputs : standalone.outputs;
  const previewUrl = hasRuntime ? webcontainer.previewUrl : undefined;
  const previewLoaded = hasRuntime && webcontainer.previewLoaded;
  const previewBuildError = hasRuntime ? webcontainer.buildError : standalone.buildError;
  const sourceError = hasRuntime ? webcontainer.sourceError : standalone.sourceError;

  useEffect(() => {
    const unsubscribe = files.map((item) =>
      item.text.subscribe(() => {
        contentChangesRef.current.record(item);
        setContentRevision((revision) => revision + 1);
      }),
    );
    return () => unsubscribe.forEach((stop) => stop());
  }, [files]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<PreviewOutput & { source?: string }>) => {
      if (
        event.source !== iframeRef.current?.contentWindow ||
        event.data?.source !== "iris-preview" ||
        !isPreviewOutput(event.data)
      )
        return;
      if (hasRuntime) webcontainer.addOutput(event.data);
      else standalone.addOutput(event.data);
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [hasRuntime, standalone.addOutput, webcontainer.addOutput]);

  useEffect(
    () => () => {
      if (previewLoadTimerRef.current !== undefined) {
        window.clearTimeout(previewLoadTimerRef.current);
      }
    },
    [],
  );

  const handlePreviewLoad = () => {
    if (!previewUrl) return;
    if (isStoragePartitioningErrorUrl(previewUrl)) {
      const message = t("preview.runtime.storage-partitioning-required");
      webcontainer.reportIframeError(message, "storage-partitioning-required");
      return;
    }
    if (previewLoadTimerRef.current !== undefined) {
      window.clearTimeout(previewLoadTimerRef.current);
    }
    previewLoadTimerRef.current = window.setTimeout(() => {
      previewLoadTimerRef.current = undefined;
      webcontainer.setPreviewLoaded(true);
    }, 900);
  };

  const rerun = () => {
    if (previewLoadTimerRef.current !== undefined) {
      window.clearTimeout(previewLoadTimerRef.current);
      previewLoadTimerRef.current = undefined;
    }
    if (hasRuntime) webcontainer.setPreviewLoaded(false);
    setPreviewLoadKey((value) => value + 1);
    requestRun();
    if (hasRuntime) webcontainer.prepareRerun();
    else standalone.prepareRerun();
  };
  const clearOutputs = () => {
    if (hasRuntime) webcontainer.clearOutputs();
    else standalone.clearOutputs();
  };

  return {
    outputs,
    runtimeState: hasRuntime ? webcontainer.runtimeState : standalone.runtimeState,
    runtimeError: hasRuntime ? webcontainer.runtimeError : undefined,
    previewUrl,
    previewLoaded,
    previewLoadKey,
    fallbackDocument: standalone.document,
    previewBuildError,
    previewSourceLocation: getPreviewSourceLocation(sourceError, file.path, file.text.toString()),
    hasSyntaxError: Boolean(sourceError),
    iframeRef,
    handlePreviewLoad,
    rerun,
    clearOutputs,
  };
}

function isPreviewOutput(value: unknown): value is PreviewOutput & { source?: string } {
  if (!value || typeof value !== "object") return false;
  const output = value as Partial<PreviewOutput>;
  return (
    (output.level === "log" || output.level === "warn" || output.level === "error") &&
    typeof output.message === "string"
  );
}
