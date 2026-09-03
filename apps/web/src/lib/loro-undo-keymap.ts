import { Prec, type Extension } from "@codemirror/state";
import { EditorView, keymap, ViewPlugin } from "@codemirror/view";
import type { UndoManager } from "loro-crdt";

const UNDO_GROUP_IDLE_MS = 750;

function defer(operation: () => void): boolean {
  queueMicrotask(operation);
  return true;
}

export function deferredLoroUndoKeymap(undoManager: UndoManager) {
  return Prec.highest(
    keymap.of([
      {
        key: "Mod-z",
        run: () => defer(() => undoManager.undo()),
        preventDefault: true,
      },
      {
        key: "Mod-y",
        mac: "Mod-Shift-z",
        run: () => defer(() => undoManager.redo()),
        preventDefault: true,
      },
      {
        key: "Mod-Shift-z",
        run: () => defer(() => undoManager.redo()),
        preventDefault: true,
      },
    ]),
  );
}

export function groupedLoroUndo(undoManager: UndoManager): Extension {
  undoManager.setMergeInterval(0);
  const grouping = new UndoGrouping(undoManager);

  return [
    EditorView.domEventObservers({
      beforeinput: (event) => {
        const inputType = event.inputType;
        if (typeof inputType === "string" && inputType.startsWith("history")) return;
        grouping.begin();
      },
      keydown: (event) => {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (["Backspace", "Delete", "Enter", "Tab"].includes(event.key)) {
          grouping.begin();
        }
      },
      blur: () => grouping.end(),
      compositionend: () => grouping.end(),
    }),
    ViewPlugin.define(() => ({
      destroy: () => grouping.destroy(),
    })),
  ];
}

class UndoGrouping {
  private active = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly undoManager: UndoManager) {}

  begin(): void {
    if (!this.active) {
      try {
        this.undoManager.groupStart();
        this.active = true;
      } catch {
        return;
      }
    }

    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.end(), UNDO_GROUP_IDLE_MS);
  }

  end(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (!this.active) return;

    try {
      this.undoManager.groupEnd();
    } finally {
      this.active = false;
    }
  }

  destroy(): void {
    this.end();
  }
}
