import { getCM } from "@replit/codemirror-vim";
import type { EditorView } from "@codemirror/view";

export function attachVimCursorStyle(
  view: EditorView,
  style: "block" | "line" | "underline" | "block-blink" | "line-blink" | "underline-blink",
): () => void {
  const apply = () => {
    const base = style.replace("-blink", "");
    view.dom
      .querySelectorAll<HTMLElement>(".cm-vimCursorLayer .cm-fat-cursor")
      .forEach((cursor) => {
        cursor.style.setProperty(
          "background",
          base === "block" ? "var(--accent)" : "transparent",
          "important",
        );
        cursor.style.setProperty(
          "background-color",
          base === "block" ? "var(--accent)" : "transparent",
          "important",
        );
        cursor.style.setProperty("color", "transparent", "important");
        cursor.style.setProperty("width", base === "line" ? "0" : "0.65em", "important");
        cursor.style.setProperty("border", "0", "important");
        if (base === "line")
          cursor.style.setProperty("border-left", "2px solid var(--accent)", "important");
        if (base === "underline")
          cursor.style.setProperty("border-bottom", "2px solid var(--accent)", "important");
      });
    const layer = view.dom.querySelector<HTMLElement>(".cm-vimCursorLayer");
    if (layer)
      layer.style.animation = style.endsWith("-blink")
        ? "iris-cursor-blink 1.2s ease-in-out infinite"
        : "none";
  };
  const observer = new MutationObserver(apply);
  observer.observe(view.dom, { childList: true, subtree: true });
  apply();
  return () => observer.disconnect();
}

export function attachVimStatus(
  view: EditorView,
  onStatus: (status: "NORMAL" | "INSERT" | "VISUAL") => void,
): () => void {
  const cm = getCM(view);
  if (!cm) return () => undefined;

  const sync = () => {
    const state = cm.state.vim;
    if (!state) return;
    const status = state.visualMode ? "VISUAL" : state.insertMode ? "INSERT" : "NORMAL";
    view.dom.classList.toggle("vim-normal", status === "NORMAL");
    onStatus(status);
  };
  const onModeChange = (event: { mode?: string }) => {
    if (event.mode === "NORMAL" || event.mode === "INSERT" || event.mode === "VISUAL") {
      view.dom.classList.toggle("vim-normal", event.mode === "NORMAL");
      onStatus(event.mode);
    } else {
      sync();
    }
  };

  sync();
  cm.on("vim-mode-change", onModeChange);
  return () => {
    cm.off("vim-mode-change", onModeChange);
    view.dom.classList.remove("vim-normal");
  };
}
