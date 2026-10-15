import { StateEffect } from "@codemirror/state";
import { ViewPlugin } from "@codemirror/view";
import type { EditorIntelligence } from "./editor-intelligence";

export const refreshEditorWorkspace = StateEffect.define<null>();

export function createEditorWorkspaceRefreshScheduler(dispatch: () => void) {
  let queued = false;
  let disposed = false;
  const notify = () => {
    if (queued || disposed) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (!disposed) dispatch();
    });
  };
  return {
    notify,
    dispose: () => {
      disposed = true;
    },
  };
}

export function editorWorkspaceRefresh(intelligence: EditorIntelligence) {
  return ViewPlugin.fromClass(
    class {
      private readonly scheduler;
      private readonly unsubscribe;

      constructor(readonly view: import("@codemirror/view").EditorView) {
        this.scheduler = createEditorWorkspaceRefreshScheduler(() => {
          this.view.dispatch({ effects: refreshEditorWorkspace.of(null) });
        });
        this.unsubscribe = intelligence.subscribeWorkspace(this.scheduler.notify);
        this.scheduler.notify();
      }

      destroy() {
        this.unsubscribe();
        this.scheduler.dispose();
      }
    },
  );
}
