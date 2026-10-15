import {
  insertCompletionText,
  pickedCompletion,
  type CompletionResult,
} from "@codemirror/autocomplete";
import type { Diagnostic } from "@codemirror/lint";
import type { IntelligenceCompletion, IntelligenceDiagnostic } from "./editor-intelligence";

export function toCodeMirrorCompletions(
  items: readonly IntelligenceCompletion[],
  position: number,
  cursor = position,
): CompletionResult {
  return {
    from: position,
    to: cursor,
    options: items.map((item) => {
      const replacement = item.replacement;
      return {
        label: item.name,
        type: item.kind,
        detail: item.insertText && item.insertText !== item.name ? item.insertText : undefined,
        apply: replacement
          ? (view, completion, currentFrom, currentTo) =>
              view.dispatch({
                ...insertCompletionText(
                  view.state,
                  item.insertText ?? item.name,
                  currentFrom + replacement.from - position,
                  currentTo + replacement.to - cursor,
                ),
                annotations: pickedCompletion.of(completion),
              })
          : (item.insertText ?? item.name),
      };
    }),
  };
}
export function toCodeMirrorDiagnostics(items: readonly IntelligenceDiagnostic[]): Diagnostic[] {
  return items
    .filter((item) => item.severity === "error" || item.severity === "warning")
    .map((item) => ({
      from: item.from,
      to: item.to,
      severity: item.severity === "error" ? "error" : "warning",
      message: `TS${item.code}: ${item.message}`,
    }));
}
