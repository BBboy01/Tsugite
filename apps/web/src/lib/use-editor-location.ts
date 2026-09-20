import { useEffect, useRef, type RefObject } from "react";
import type { EditorView } from "@codemirror/view";
import type { EditorLocation } from "./editor-navigation";

function applyLocation(view: EditorView, location: EditorLocation): boolean {
  if (location.source !== view.state.doc.toString()) return false;
  if (location.from < 0 || location.to < location.from || location.to > view.state.doc.length) {
    return false;
  }
  view.focus();
  view.dispatch({
    selection: { anchor: location.from, head: location.to },
    scrollIntoView: true,
    userEvent: "select",
  });
  return true;
}

export function useEditorLocation({
  path,
  viewRef,
  requestedLocation,
  onLocationHandled,
  onLocalInteraction,
  onSelectTab,
}: {
  path: string;
  viewRef: RefObject<EditorView | null>;
  requestedLocation?: EditorLocation;
  onLocationHandled?: () => void;
  onLocalInteraction: () => void;
  onSelectTab: (path: string) => void;
}) {
  const pendingLocationRef = useRef<EditorLocation | null>(null);
  const requestRef = useRef({ requestedLocation, onLocationHandled });
  requestRef.current = { requestedLocation, onLocationHandled };

  const applyPendingLocation = (view: EditorView): boolean => {
    const pending = pendingLocationRef.current;
    if (!pending || pending.path !== path) return false;
    pendingLocationRef.current = null;
    if (pending === requestRef.current.requestedLocation) requestRef.current.onLocationHandled?.();
    return applyLocation(view, pending);
  };

  useEffect(() => {
    if (!requestedLocation || requestedLocation.path !== path) return;
    pendingLocationRef.current = requestedLocation;
    if (viewRef.current) applyPendingLocation(viewRef.current);
  }, [requestedLocation, path]);

  const navigateToLocation = (location: EditorLocation) => {
    onLocalInteraction();
    if (location.path === path && viewRef.current) {
      applyLocation(viewRef.current, location);
    } else {
      pendingLocationRef.current = location;
      onSelectTab(location.path);
    }
  };
  return { navigateToLocation, applyPendingLocation };
}
