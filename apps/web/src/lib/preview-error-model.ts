import type { PreviewOutput } from "./preview-runner";

export function getLatestPreviewError(outputs: readonly PreviewOutput[]): string | undefined {
  return outputs.findLast((output) => output.level === "error")?.message;
}
