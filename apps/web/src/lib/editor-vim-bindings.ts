import type { EditorView } from "@codemirror/view";
import type { ProjectSettings } from "@iris/shared";

import { attachVimClipboard } from "./vim-clipboard";
import { attachVimSearch } from "./vim-search";
import { attachVimCursorStyle, attachVimStatus } from "./vim-status";

type CursorStyle = ProjectSettings["normalCursorStyle"];

export class EditorVimBindings {
  private cursorStyle?: CursorStyle;
  private systemClipboard?: boolean;
  private detachCursorStyle = () => {};
  private detachClipboard = () => {};
  private readonly detachSearch: () => void;
  private readonly detachStatus: () => void;

  constructor(
    private readonly view: EditorView,
    private readonly enabled: boolean,
    cursorStyle: CursorStyle,
    systemClipboard: boolean,
    onStatus: (status: string) => void,
  ) {
    this.update(cursorStyle, systemClipboard);
    this.detachSearch = enabled ? attachVimSearch(view) : () => {};
    this.detachStatus = enabled ? attachVimStatus(view, onStatus) : () => {};
  }

  update(cursorStyle: CursorStyle, systemClipboard: boolean): void {
    if (this.cursorStyle !== cursorStyle) {
      this.detachCursorStyle();
      this.view.dom.dataset.normalCursorStyle = cursorStyle;
      this.detachCursorStyle = this.enabled
        ? attachVimCursorStyle(this.view, cursorStyle)
        : () => {};
      this.cursorStyle = cursorStyle;
    }
    if (this.systemClipboard !== systemClipboard) {
      this.detachClipboard();
      this.detachClipboard = this.enabled
        ? attachVimClipboard(this.view, systemClipboard)
        : () => {};
      this.systemClipboard = systemClipboard;
    }
  }

  destroy(): void {
    this.detachStatus();
    this.detachSearch();
    this.detachCursorStyle();
    this.detachClipboard();
    this.view.dom.removeAttribute("data-normal-cursor-style");
  }
}
