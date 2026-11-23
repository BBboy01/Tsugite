import { useCallback, useEffect, useRef } from "react";
import { useStore } from "jotai";
import {
  fileSearchOpenAtom,
  selectedPathAtom,
  settingsOpenAtom,
} from "./workspace-atoms";

function getControlFocus() {
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement;
  }
  const popup = active?.closest('[role="menu"], [role="dialog"]');
  const popupClosed = popup?.getAttribute("data-state") === "closed";
  return {
    treeSearch: Boolean(
      active?.closest('[data-file-tree-search-container][data-open="true"]'),
    ),
    input: Boolean(
      active &&
      !popupClosed &&
      !active.closest(".cm-editor") &&
      active.matches("input, textarea, select, [contenteditable='true']"),
    ),
    popup: Boolean(
      (popup && !popupClosed) ||
      document.querySelector(
        '[role="menu"][data-state="open"], [role="dialog"][data-state="open"]',
      ),
    ),
  };
}

export function useEditorFocus(selectedPath: string) {
  const store = useStore();
  const editorFocusRef = useRef<(() => void) | undefined>(undefined);
  const editorPathRef = useRef<string | undefined>(undefined);
  const focusEditorWhenReadyRef = useRef(false);
  const focusInitialEditorRef = useRef(true);
  const focusVersionRef = useRef(0);
  const pendingSelectionFocusRef = useRef<{ focusVersion: number } | null>(
    null,
  );

  const focusEditorIfRequested = useCallback(() => {
    const focus = editorFocusRef.current;
    if (
      focus &&
      editorPathRef.current === store.get(selectedPathAtom) &&
      (focusEditorWhenReadyRef.current || focusInitialEditorRef.current)
    ) {
      focusEditorWhenReadyRef.current = false;
      focusInitialEditorRef.current = false;
      const control = getControlFocus();
      if (!control.input && !control.popup) focus();
    }
  }, [store]);

  const scheduleSelectionFocus = useCallback(() => {
    const pending = pendingSelectionFocusRef.current;
    if (!pending) return;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (pendingSelectionFocusRef.current !== pending) return;
        const focus = editorFocusRef.current;
        if (!focus || editorPathRef.current !== store.get(selectedPathAtom))
          return;
        pendingSelectionFocusRef.current = null;
        const control = getControlFocus();
        if (
          control.popup ||
          control.treeSearch ||
          (control.input && focusVersionRef.current !== pending.focusVersion)
        )
          return;
        focus();
      }),
    );
  }, [store]);

  const requestSelectionFocus = useCallback(() => {
    pendingSelectionFocusRef.current = {
      focusVersion: focusVersionRef.current,
    };
    scheduleSelectionFocus();
  }, [scheduleSelectionFocus]);

  const handleEditorFocusReady = useCallback(
    (focus: (() => void) | undefined) => {
      editorFocusRef.current = focus;
      editorPathRef.current = focus ? selectedPath : undefined;
      // StrictMode can replace a synchronously mounted view before effects settle.
      queueMicrotask(() => {
        if (!focus || editorFocusRef.current !== focus) return;
        focusEditorIfRequested();
        if (pendingSelectionFocusRef.current) {
          scheduleSelectionFocus();
        }
      });
    },
    [focusEditorIfRequested, scheduleSelectionFocus, selectedPath],
  );

  useEffect(() => {
    const roots = new Set<ShadowRoot>();
    const observeShadowFocus = () => {
      let active = document.activeElement;
      while (active?.shadowRoot) {
        const root = active.shadowRoot;
        if (!roots.has(root)) {
          roots.add(root);
          root.addEventListener("focusin", handleFocus, true);
        }
        active = root.activeElement;
      }
    };
    const handleFocus = () => {
      focusVersionRef.current += 1;
      observeShadowFocus();
    };
    document.addEventListener("focusin", handleFocus, true);
    observeShadowFocus();
    return () => {
      document.removeEventListener("focusin", handleFocus, true);
      for (const root of roots)
        root.removeEventListener("focusin", handleFocus, true);
    };
  }, []);

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
