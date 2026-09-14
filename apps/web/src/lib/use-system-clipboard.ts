import { useSyncExternalStore } from "react";

const key = "tsugite.system-clipboard";
const changeEvent = "tsugite:system-clipboard";

function subscribe(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(changeEvent, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(changeEvent, notify);
  };
}

function read() {
  return window.localStorage.getItem(key) === "true";
}

function write(enabled: boolean) {
  window.localStorage.setItem(key, String(enabled));
  window.dispatchEvent(new Event(changeEvent));
}

export function useSystemClipboard() {
  return [useSyncExternalStore(subscribe, read, () => false), write] as const;
}
