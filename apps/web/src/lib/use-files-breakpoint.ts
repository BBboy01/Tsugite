import { useSyncExternalStore } from "react";

const FILES_MOBILE_QUERY = "(max-width: 760px)";

function subscribe(onChange: () => void) {
  const mediaQuery = window.matchMedia(FILES_MOBILE_QUERY);
  mediaQuery.addEventListener("change", onChange);
  return () => mediaQuery.removeEventListener("change", onChange);
}

function getSnapshot() {
  return window.matchMedia(FILES_MOBILE_QUERY).matches;
}

export function useFilesBreakpoint() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
