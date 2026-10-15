import { linter } from "@codemirror/lint";
import type { EditorIntelligence } from "./editor-intelligence";
import { toCodeMirrorDiagnostics } from "./typescript-code-actions";
import { refreshEditorWorkspace } from "./editor-workspace-refresh";

export function typeScriptDiagnostics(intelligence: EditorIntelligence, path: string) {
  return linter(
    async (view) => {
      const doc = view.state.doc;
      const revision = intelligence.workspaceVersion;
      const result = await intelligence.diagnostics({ path, revision, timeoutMs: 2000 });
      return result.status === "ok" &&
        view.state.doc === doc &&
        intelligence.workspaceVersion === revision
        ? toCodeMirrorDiagnostics(result.value)
        : [];
    },
    {
      delay: 200,
      autoPanel: false,
      needsRefresh: (update) =>
        update.transactions.some((transaction) =>
          transaction.effects.some((effect) => effect.is(refreshEditorWorkspace)),
        ),
      hideOn: (transaction) =>
        transaction.effects.some((effect) => effect.is(refreshEditorWorkspace)) ? true : null,
    },
  );
}
