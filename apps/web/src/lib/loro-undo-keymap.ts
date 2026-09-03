import { Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import type { UndoManager } from "loro-crdt";

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
