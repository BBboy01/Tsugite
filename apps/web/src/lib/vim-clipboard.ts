import { Vim } from "@replit/codemirror-vim";
import type { EditorView } from "@codemirror/view";

export function attachVimClipboard(view: EditorView, enabled: boolean): () => void {
  if (!enabled || typeof navigator === "undefined" || !navigator.clipboard) {
    return () => undefined;
  }

  Vim.noremap("p", '"+p', "normal");
  Vim.noremap("P", '"+P', "normal");
  const registerController = Vim.getRegisterController();
  const getSnapshot = () => {
    const register = registerController.unnamedRegister;
    return {
      text: register.toString(),
      linewise: register.linewise,
      blockwise: register.blockwise,
    };
  };
  let lastSnapshot = getSnapshot();
  const syncRegister = () => {
    const nextSnapshot = getSnapshot();
    if (
      nextSnapshot.text === lastSnapshot.text &&
      nextSnapshot.linewise === lastSnapshot.linewise &&
      nextSnapshot.blockwise === lastSnapshot.blockwise
    ) {
      return;
    }
    lastSnapshot = nextSnapshot;
    registerController
      .getRegister("+")
      .setText(nextSnapshot.text, nextSnapshot.linewise, nextSnapshot.blockwise);
    void navigator.clipboard.writeText(nextSnapshot.text).catch(() => undefined);
  };
  view.dom.addEventListener("keyup", syncRegister, true);

  return () => {
    view.dom.removeEventListener("keyup", syncRegister, true);
    Vim.unmap("p", "normal");
    Vim.unmap("P", "normal");
  };
}
