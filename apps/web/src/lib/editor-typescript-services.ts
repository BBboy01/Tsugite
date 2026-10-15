import { StateEffect } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { listFiles } from "@iris/shared";
import type { LoroDoc } from "loro-crdt";
import type { EditorIntelligence } from "./editor-intelligence";
import { typeScriptCompletion } from "./typescript-completion";
import { typeScriptDiagnostics } from "./typescript-diagnostics";
import { typeScriptSignatureHelp } from "./typescript-signature";
import { editorWorkspaceRefresh } from "./editor-workspace-refresh";

export function attachEditorTypeScriptServices(
  view: EditorView,
  path: string,
  doc: LoroDoc,
  onReady: (intelligence: EditorIntelligence) => void,
): () => void {
  let disposed = false;
  let intelligence: EditorIntelligence | undefined;
  let unsubscribe: (() => void) | undefined;
  const getFiles = () =>
    listFiles(doc).map((file) => ({ path: file.path, text: file.text.toString() }));

  const load = async () => {
    try {
      const [{ createTypeScriptIntelligence }, { typeScriptHover }] = await Promise.all([
        import("./typescript-intelligence"),
        import("./typescript-hover"),
      ]);
      if (disposed) return;
      // Edits and file switches can happen while the optional modules are loading.
      intelligence = createTypeScriptIntelligence(path, view.state.doc.toString(), getFiles());
      const activeIntelligence = intelligence;
      unsubscribe = doc.subscribe((batch) => {
        if (
          batch.events.some((event) => {
            const root = event.path[0];
            return root === "files" || root === "filePaths" || String(root).startsWith("file:");
          })
        )
          void activeIntelligence.syncWorkspace(getFiles());
      });
      view.dispatch({
        effects: StateEffect.appendConfig.of([
          EditorView.updateListener.of((update) => {
            if (update.docChanged)
              void activeIntelligence.updateFile({ path, text: update.state.doc.toString() });
          }),
          typeScriptHover(activeIntelligence, path),
          typeScriptCompletion(activeIntelligence, path),
          typeScriptSignatureHelp(activeIntelligence, path),
          editorWorkspaceRefresh(activeIntelligence),
          typeScriptDiagnostics(activeIntelligence, path),
        ]),
      });
      onReady(activeIntelligence);
    } catch (error) {
      unsubscribe?.();
      intelligence?.dispose();
      intelligence = undefined;
      if (!disposed) console.warn("TypeScript language services are unavailable.", error);
    }
  };
  void load();

  return () => {
    disposed = true;
    unsubscribe?.();
    intelligence?.dispose();
    intelligence = undefined;
  };
}
