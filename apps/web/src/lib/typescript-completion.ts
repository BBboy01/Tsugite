import { javascriptLanguage } from "@codemirror/lang-javascript";
import { createIntelligenceRequestId, type EditorIntelligence } from "./editor-intelligence";
import { toCodeMirrorCompletions } from "./typescript-code-actions";

export function createCompletionSource(intelligence: EditorIntelligence, path: string) {
  return async (context: import("@codemirror/autocomplete").CompletionContext) => {
    const word = context.matchBefore(/[\p{L}_$][\p{L}\p{N}_$]*$/u);
    if (!context.explicit && !word && !context.matchBefore(/\.$/)) return null;
    const doc = context.state.doc;
    const workspaceVersion = intelligence.workspaceVersion;
    const requestId = createIntelligenceRequestId("completion");
    context.addEventListener("abort", () => intelligence.cancel(requestId), {
      onDocChange: true,
    });
    const result = await intelligence.completion({
      path,
      position: context.pos,
      requestId,
      timeoutMs: 2000,
    });
    if (
      context.aborted ||
      context.state.doc !== doc ||
      intelligence.workspaceVersion !== workspaceVersion ||
      result.status !== "ok"
    )
      return null;
    return toCodeMirrorCompletions(result.value, word?.from ?? context.pos, context.pos);
  };
}

export function typeScriptCompletion(intelligence: EditorIntelligence, path: string) {
  return javascriptLanguage.data.of({ autocomplete: createCompletionSource(intelligence, path) });
}
