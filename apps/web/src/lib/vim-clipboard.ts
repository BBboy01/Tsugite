import { getCM, Vim } from "@replit/codemirror-vim";
import type { EditorView } from "@codemirror/view";

export function attachVimClipboard(view: EditorView, enabled: () => boolean): () => void {
  const cm = getCM(view);
  if (!cm) return () => undefined;
  let disposed = false;
  let generation = 0;
  let pendingWrite: Promise<void> = Promise.resolve();
  let shouldWrite = false;
  const onKeyDown = (event: KeyboardEvent) => {
    const request = ++generation;
    if (!enabled() || !navigator.clipboard || event.isComposing) return;
    const vim = cm?.state.vim;
    if (!vim || vim.insertMode || event.ctrlKey || event.metaKey || event.altKey) return;
    const input = vim.inputState;
    const register = Vim.getRegisterController().getRegister();
    const defaultRegister = !input.registerName || input.registerName === '"';
    if (event.key === "y" && defaultRegister) shouldWrite = true;
    if (
      (event.key !== "p" && event.key !== "P") ||
      !defaultRegister ||
      input.operator ||
      input.keyBuffer.length > 0
    ) {
      queueMicrotask(() => {
        if (disposed || !enabled() || !defaultRegister || !shouldWrite) return;
        shouldWrite = false;
        const text = register.toString();
        pendingWrite = pendingWrite
          .then(() => navigator.clipboard.writeText(text))
          .catch(() => undefined);
      });
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const insertAfter = event.key === "p";
    void (async () => {
      await pendingWrite;
      let text: string | undefined;
      try {
        text = await navigator.clipboard.readText();
      } catch {
        // Permission denial keeps the native Vim register available.
        text = register.toString();
      }
      if (disposed || request !== generation || !enabled()) return;
      if (text !== undefined && text !== register.toString()) {
        register.setText(text, text.endsWith("\n"), false);
      }
      if (text) {
        const position = cm.getCursor();
        if (!insertAfter && position.ch > 0) position.ch -= 1;
        cm.replaceRange(text, position);
        cm.setCursor(position.line, position.ch + text.length);
      }
    })();
  };
  view.dom.addEventListener("keydown", onKeyDown, true);
  const onCommand = () => {
    if (!enabled() || !navigator.clipboard || disposed || !shouldWrite) return;
    shouldWrite = false;
    const text = Vim.getRegisterController().getRegister().toString();
    pendingWrite = pendingWrite
      .then(() => navigator.clipboard.writeText(text))
      .catch(() => undefined);
  };
  cm.on("vim-command-done", onCommand);
  return () => {
    disposed = true;
    view.dom.removeEventListener("keydown", onKeyDown, true);
    cm.off("vim-command-done", onCommand);
  };
}
