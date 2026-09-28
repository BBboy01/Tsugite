import { useCallback, useEffect, useState } from "react";
import type { ProjectFile } from "@iris/shared";
import type { PreviewOutput } from "./preview-runner";
import type { PreviewSourceError } from "./preview-error-model";

export function usePreviewStandalone(
  file: ProjectFile,
  enabled: boolean,
  contentRevision: number,
  runKey: number,
) {
  const [document, setDocument] = useState("");
  const [outputs, setOutputs] = useState<PreviewOutput[]>([]);
  const [runtimeState, setRuntimeState] = useState<"idle" | "error">("idle");
  const [buildError, setBuildError] = useState<string | undefined>(undefined);
  const [sourceError, setSourceError] = useState<PreviewSourceError | undefined>(undefined);

  useEffect(() => {
    if (!enabled) {
      setDocument("");
      setOutputs([]);
      setRuntimeState("idle");
      setBuildError(undefined);
      setSourceError(undefined);
      return;
    }
    let cancelled = false;
    setRuntimeState("idle");
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const { createPreviewDocument, runPreview } = await import("./preview-runner");
          if (cancelled) return;
          const source = file.text.toString();
          const result = runPreview(source, file.language);
          if (cancelled) return;
          if (result.error) {
            setRuntimeState("error");
            setDocument("");
            setOutputs([{ level: "error", message: result.error }]);
            setBuildError(result.error);
            setSourceError({ path: file.path, source, location: result.location });
            return;
          }
          setDocument(createPreviewDocument(result.code ?? ""));
          setOutputs([]);
          setBuildError(undefined);
          setSourceError(undefined);
        } catch (error) {
          if (cancelled) return;
          setRuntimeState("error");
          const message = error instanceof Error ? error.message : String(error);
          setDocument("");
          setOutputs([{ level: "error", message }]);
          setBuildError(message);
          setSourceError(undefined);
        }
      })();
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [contentRevision, enabled, file, runKey]);

  const addOutput = useCallback((output: PreviewOutput) => {
    setOutputs((current) => appendOutput(current, output));
    if (output.level === "error") setRuntimeState("error");
  }, []);
  const clearOutputs = useCallback(() => setOutputs([]), []);
  const prepareRerun = useCallback(() => setBuildError(undefined), []);

  return {
    document,
    outputs,
    runtimeState,
    buildError,
    sourceError,
    addOutput,
    clearOutputs,
    prepareRerun,
  };
}

function appendOutput(outputs: PreviewOutput[], output: PreviewOutput): PreviewOutput[] {
  return [...outputs, output].slice(-80);
}
