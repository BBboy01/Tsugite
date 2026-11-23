import { useCallback, useEffect, useRef } from "react";
import { useStore } from "jotai";
import {
  fileSearchOpenAtom,
  selectedPathAtom,
  settingsOpenAtom,
} from "./workspace-atoms";

export function useEditorFocus(selectedPath: string) {
  const store = useStore();
  const editorFocusRef = useRef<(() => void) | undefined>(undefined);
  const editorPathRef = useRef<string | undefined>(undefined);
  const focusEditorWhenReadyRef = useRef(false);
  const focusInitialEditorRef = useRef(true);
  const focusEditorAfterSelectionRef = useRef(false);

  const focusEditorIfRequested = useCallback(() => {
    const focus = editorFocusRef.current;
    if (
      focus &&
      editorPathRef.current === store.get(selectedPathAtom) &&
      (focusEditorWhenReadyRef.current || focusInitialEditorRef.current)
    ) {
      focusEditorWhenReadyRef.current = false;
      focusInitialEditorRef.current = false;
      focus();
    }
  }, [store]);

  const requestSelectionFocus = useCallback(() => {
    focusEditorAfterSelectionRef.current = true;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!focusEditorAfterSelectionRef.current) return;
        const focus = editorFocusRef.current;
        if (!focus || editorPathRef.current !== store.get(selectedPathAtom))
          return;
        focusEditorAfterSelectionRef.current = false;
        focus();
      }),
    );
  }, [store]);

  const handleEditorFocusReady = useCallback(
    (focus: (() => void) | undefined) => {
      editorFocusRef.current = focus;
      editorPathRef.current = focus ? selectedPath : undefined;
      // StrictMode can replace a synchronously mounted view before effects settle.
      queueMicrotask(() => {
        if (!focus || editorFocusRef.current !== focus) return;
        focusEditorIfRequested();
        if (focusEditorAfterSelectionRef.current) {
          requestSelectionFocus();
        }
      });
    },
    [focusEditorIfRequested, requestSelectionFocus, selectedPath],
  );

  useEffect(() => {
    let previousSettingsOpen = store.get(settingsOpenAtom);
    let previousFileSearchOpen = store.get(fileSearchOpenAtom);
    const handleDialogStateChange = () => {
      const fileSearchOpen = store.get(fileSearchOpenAtom);
      if (previousFileSearchOpen && !fileSearchOpen) {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => focusEditorIfRequested()),
        );
      }
      previousFileSearchOpen = fileSearchOpen;

      const settingsOpen = store.get(settingsOpenAtom);
      if (previousSettingsOpen && !settingsOpen) {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => editorFocusRef.current?.()),
        );
      }
      previousSettingsOpen = settingsOpen;
    };
    const unsubscribeFileSearch = store.sub(
      fileSearchOpenAtom,
      handleDialogStateChange,
    );
    const unsubscribeSettings = store.sub(
      settingsOpenAtom,
      handleDialogStateChange,
    );
    return () => {
      unsubscribeFileSearch();
      unsubscribeSettings();
    };
  }, [focusEditorIfRequested, store]);

  return {
    editorFocusRef,
    focusEditorWhenReadyRef,
    focusInitialEditorRef,
    requestSelectionFocus,
    handleEditorFocusReady,
  };
}
