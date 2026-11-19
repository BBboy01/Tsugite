import type { PreviewOutput } from "./preview-runner";
import type { PreviewSourceError } from "./preview-error-model";
import type { RuntimeError, RuntimeState } from "./webcontainer-runtime";

export type PreviewWebContainerState = {
  outputs: PreviewOutput[];
  runtimeState: RuntimeState;
  runtimeError?: RuntimeError;
  buildError?: string;
  sourceError?: PreviewSourceError;
  previewUrl?: string;
  previewLoaded: boolean;
};

export function initialPreviewWebContainerState(): PreviewWebContainerState {
  return { outputs: [], runtimeState: "idle", previewLoaded: false };
}

export function appendPreviewOutput(
  outputs: PreviewOutput[],
  output: PreviewOutput,
): PreviewOutput[] {
  return [...outputs, output].slice(-80);
}
