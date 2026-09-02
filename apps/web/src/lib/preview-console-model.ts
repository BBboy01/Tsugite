export const DEFAULT_PREVIEW_CONSOLE_HEIGHT = 144;
export const MIN_PREVIEW_CONSOLE_HEIGHT = 72;

export type PreviewOutputFilter = "all" | "log" | "warn" | "error";

export type PreviewOutputLike = {
  level: "log" | "warn" | "error";
};

export function filterPreviewOutputs<T extends PreviewOutputLike>(
  outputs: T[],
  filter: PreviewOutputFilter,
): T[] {
  if (filter === "all") {
    return outputs;
  }

  return outputs.filter((output) => output.level === filter);
}

export function getPreviewConsoleMaxHeight(previewHeight: number): number {
  return Math.max(MIN_PREVIEW_CONSOLE_HEIGHT, previewHeight / 2);
}

export function clampPreviewConsoleHeight(height: number, previewHeight: number): number {
  return Math.min(
    Math.max(height, MIN_PREVIEW_CONSOLE_HEIGHT),
    getPreviewConsoleMaxHeight(previewHeight),
  );
}

export function resizePreviewConsoleHeight(
  height: number,
  pointerDeltaY: number,
  previewHeight: number,
): number {
  return clampPreviewConsoleHeight(height - pointerDeltaY, previewHeight);
}
