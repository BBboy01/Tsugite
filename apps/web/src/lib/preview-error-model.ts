import type { PreviewOutput, PreviewSyntaxLocation } from "./preview-runner";
import type { EditorLocation } from "./editor-navigation";
import type { RuntimeAction } from "./runtime-actions";
import type { RuntimeError } from "./webcontainer-runtime";

export type PreviewSourceError = {
  path: string;
  source: string;
  location?: PreviewSyntaxLocation;
};

export function getLatestPreviewError(outputs: readonly PreviewOutput[]): string | undefined {
  return outputs.findLast((output) => output.level === "error")?.message;
}

export function getPreviewSourceLocation(
  error: PreviewSourceError | undefined,
  path: string,
  source: string,
): EditorLocation | undefined {
  if (!error?.location || error.path !== path || error.source !== source) return undefined;
  const { line, column, offset } = error.location;
  if (offset > source.length) return undefined;
  return { path, source, from: offset, to: offset, line, column };
}

export function getPreviewRecoveryActions(
  error: RuntimeError | undefined,
  syntaxError: boolean,
  hasRuntime: boolean,
): RuntimeAction[] {
  if (syntaxError || !hasRuntime) return [];
  if (error === "install-failed" || error === "start-failed") return ["restart", "reinstall"];
  if (!error || error === "runtime-unavailable") return ["restart"];
  return [];
}
