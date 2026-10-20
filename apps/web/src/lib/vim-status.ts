import { getCM, Vim } from "@replit/codemirror-vim";
import type { EditorView } from "@codemirror/view";
import { editorStatusAt } from "./editor-status";

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
        cursor.style.setProperty("outline-color", "var(--accent)", "important");
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

export function attachVimNotifications(view: EditorView): () => void {
  const cm = getCM(view);
  if (!cm) return () => undefined;

  const onKeyDown = (event: KeyboardEvent) => {
    if (
      event.key === "Meta" ||
      !cm.state.dialog?.querySelector(".cm-vim-message") ||
      !Vim.vimKeyFromEvent(event, cm.state.vim ?? undefined)
    ) {
      return;
    }
    const close = cm.state.currentNotificationClose;
    cm.state.currentNotificationClose = null;
    if (cm.state.closeVimNotification === close) cm.state.closeVimNotification = null;
    close?.();
  };

  view.dom.addEventListener("keydown", onKeyDown, true);
  return () => view.dom.removeEventListener("keydown", onKeyDown, true);
}

export type VimStatusDetails = {
  refresh: () => void;
  destroy: () => void;
};

export function attachVimStatusDetails(view: EditorView, path: string): VimStatusDetails {
  const cm = getCM(view);
  if (!cm) return { refresh: () => undefined, destroy: () => undefined };

  let syncing = false;
  const observer = new MutationObserver(() => refresh());
  const refresh = () => {
    if (syncing) return;
    const statusbar = cm.state.statusbar as HTMLElement | undefined;
    if (!statusbar || cm.state.dialog) return;

    const state = cm.state.vim;
    if (!state) return;
    const mode = state.visualMode ? "VISUAL" : state.insertMode ? "INSERT" : "NORMAL";
    const status = editorStatusAt(view, path);
    const leading = document.createElement("div");
    leading.className = "iris-editor-status-group iris-editor-status-leading";
    const modeElement = document.createElement("span");
    modeElement.className = "iris-editor-status-mode";
    modeElement.dataset.statusMode = "";
    modeElement.textContent = `--${mode}--`;
    const pathElement = document.createElement("span");
    pathElement.className = "iris-editor-status-path";
    pathElement.dataset.statusPath = "";
    pathElement.title = status.path;
    pathElement.textContent = status.path;
    leading.append(modeElement, pathElement);

    if (state.status) {
      const command = document.createElement("span");
      command.className = "iris-editor-status-command";
      command.dataset.statusCommand = "";
      command.textContent = state.status;
      leading.append(command);
    }

    const trailing = document.createElement("div");
    trailing.className = "iris-editor-status-group iris-editor-status-trailing";
    const position = document.createElement("span");
    position.className = "iris-editor-status-position";
    position.dataset.statusPosition = "";
    position.textContent = status.position;
    const progress = document.createElement("span");
    progress.className = "iris-editor-status-progress";
    progress.dataset.statusProgress = "";
    progress.textContent = status.progress;
    trailing.append(position, progress);

    syncing = true;
    observer.disconnect();
    statusbar.replaceChildren(leading, trailing);
    statusbar.dataset.editorStatus = "";
    observer.observe(statusbar, { childList: true, subtree: true, characterData: true });
    syncing = false;
  };

  refresh();
  const statusbar = cm.state.statusbar as HTMLElement | undefined;
  if (statusbar)
    observer.observe(statusbar, { childList: true, subtree: true, characterData: true });
  return {
    refresh,
    destroy: () => observer.disconnect(),
  };
}
