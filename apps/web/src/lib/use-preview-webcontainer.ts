import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { ProjectFile, ProjectSettings } from "@iris/shared";
import type { TFunction } from "i18next";
import type { PendingPreviewChange } from "./preview-content-changes";
import type { ProjectDeclarations } from "./room-typescript-intelligence";
import {
  dispatchRuntimeActionComplete,
  subscribeRuntimeAction,
} from "./runtime-actions";
import { PreviewWebContainerScheduler } from "./preview-webcontainer-scheduler";

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
  declarations,
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
  declarations?: ProjectDeclarations;
}) {
  const scheduler = useMemo(
    () =>
      new PreviewWebContainerScheduler({
        declarations,
        completeAction: dispatchRuntimeActionComplete,
      }),
    [declarations],
  );
  const state = useSyncExternalStore(
    scheduler.subscribe,
    scheduler.getSnapshot,
    scheduler.getSnapshot,
  );

  useEffect(() => () => scheduler.dispose(), [scheduler]);

  useEffect(() => {
    scheduler.update({
      enabled,
      file,
      files,
      folders,
      settings,
      runKey,
      acknowledgeContentChanges,
      getPendingContentChanges,
      translateError: (error) =>
        translate(`preview.runtime.${error}`, {
          manager: settings.packageManager,
        }),
    });
    return () => scheduler.cancelPending();
  }, [
    scheduler,
    enabled,
    file,
    files,
    folders,
    contentRevision,
    contentChanges,
    runKey,
    acknowledgeContentChanges,
    getPendingContentChanges,
    settings,
    translate,
  ]);

  useEffect(
    () =>
      subscribeRuntimeAction((action) => {
        if (!enabled) return;
        scheduler.requestAction(action);
        requestRun();
      }),
    [enabled, requestRun, scheduler],
  );

  return {
    ...state,
    setPreviewLoaded: scheduler.setPreviewLoaded,
    setPreviewUrl: scheduler.setPreviewUrl,
    addOutput: scheduler.addOutput,
    reportIframeError: scheduler.reportIframeError,
    clearOutputs: scheduler.clearOutputs,
    prepareRerun: scheduler.prepareRerun,
  };
}
