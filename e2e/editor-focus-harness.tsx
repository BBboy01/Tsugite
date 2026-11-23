import { useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { createStore, Provider, useAtomValue } from "jotai";
import { useEditorFocus } from "../apps/web/src/lib/use-editor-focus";
import {
  selectedPathAtom,
  workspaceCommandAtom,
} from "../apps/web/src/lib/workspace-atoms";

export type EditorFocusHarness = {
  select: (path: string) => void;
  ready: (id: string) => void;
};

declare global {
  interface Window {
    editorFocusHarness: EditorFocusHarness;
  }
}

const store = createStore();

function FocusHarness() {
  const path = useAtomValue(selectedPathAtom);
  const { handleEditorFocusReady, requestSelectionFocus } =
    useEditorFocus(path);
  useLayoutEffect(() => {
    window.editorFocusHarness = {
      select: (nextPath) => {
        store.set(workspaceCommandAtom, {
          type: "select-file",
          path: nextPath,
        });
        requestSelectionFocus();
      },
      ready: (id) =>
        handleEditorFocusReady(() => document.getElementById(id)?.focus()),
    };
  }, [handleEditorFocusReady, requestSelectionFocus]);
  return (
    <>
      <output>{path}</output>
      <textarea id="old-editor" aria-label="Old editor" />
      <textarea id="new-editor" aria-label="New editor" />
      <button type="button">Other control</button>
    </>
  );
}

createRoot(document.getElementById("app")!).render(
  <Provider store={store}>
    <FocusHarness />
  </Provider>,
);
requestAnimationFrame(() => document.getElementById("app-boot")?.remove());
