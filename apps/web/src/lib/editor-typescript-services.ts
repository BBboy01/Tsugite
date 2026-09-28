import { StateEffect } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { VirtualTypeScriptEnvironment } from "@typescript/vfs";
import type { NavigationFile } from "./editor-navigation";

export function attachEditorTypeScriptServices(
  view: EditorView,
  path: string,
  getFiles: () => readonly NavigationFile[],
  onReady: (environment: VirtualTypeScriptEnvironment) => void,
): () => void {
  let disposed = false;
  let environment: VirtualTypeScriptEnvironment | undefined;

  const load = async () => {
    try {
      const [services, { createEditorTypeScriptEnvironment }, { renderTypeScriptHover }] =
        await Promise.all([
          import("@valtown/codemirror-ts"),
          import("./typescript-environment"),
          import("./typescript-hover"),
        ]);
      if (disposed) return;
      // Edits and file switches can happen while the optional modules are loading.
      environment = createEditorTypeScriptEnvironment(path, view.state.doc.toString(), getFiles());
      const activeEnvironment = environment;
      view.dispatch({
        effects: StateEffect.appendConfig.of([
          services.tsFacet.of({ env: environment, path: `/${path}` }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged)
              activeEnvironment.updateFile(`/${path}`, update.state.doc.toString());
          }),
          services.tsHover({ renderTooltip: renderTypeScriptHover }),
        ]),
      });
      onReady(environment);
    } catch (error) {
      environment?.languageService.dispose();
      environment = undefined;
      if (!disposed) console.warn("TypeScript language services are unavailable.", error);
    }
  };
  void load();

  return () => {
    disposed = true;
    environment?.languageService.dispose();
    environment = undefined;
  };
}
