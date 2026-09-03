import { RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";

import type { PresenceMember } from "@iris/shared";

export type RemoteSelection = {
  userId: string;
  displayName: string;
  color: string;
  from: number;
  to: number;
  head: number;
};

const setRemotePresence = StateEffect.define<readonly RemoteSelection[]>();

const remotePresenceField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    let next = transaction.docChanged ? decorations.map(transaction.changes) : decorations;
    for (const effect of transaction.effects) {
      if (effect.is(setRemotePresence)) next = buildRemoteDecorations(effect.value);
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function remotePresenceExtension(): Extension {
  return remotePresenceField;
}

export function updateRemotePresence(view: EditorView, selections: readonly RemoteSelection[]) {
  view.dispatch({ effects: setRemotePresence.of(selections) });
}

export function getRemoteSelections(
  members: readonly PresenceMember[],
  currentUserId: string,
  selectedPath: string,
  documentLength: number,
): RemoteSelection[] {
  const length = Number.isFinite(documentLength) ? Math.max(0, Math.trunc(documentLength)) : 0;

  return members.flatMap((member) => {
    if (member.userId === currentUserId || member.selectedPath !== selectedPath || !member.cursor) {
      return [];
    }

    const displayName = member.displayName.trim().slice(0, 32);
    if (!displayName) return [];

    const anchor = clampPosition(member.cursor.anchor, length);
    const head = clampPosition(member.cursor.head, length);
    return [
      {
        userId: member.userId,
        displayName,
        color: isHexColor(member.color) ? member.color : "var(--accent)",
        from: Math.min(anchor, head),
        to: Math.max(anchor, head),
        head,
      },
    ];
  });
}

class RemoteCursorWidget extends WidgetType {
  constructor(private readonly selection: RemoteSelection) {
    super();
  }

  eq(other: RemoteCursorWidget): boolean {
    return (
      this.selection.userId === other.selection.userId &&
      this.selection.displayName === other.selection.displayName &&
      this.selection.color === other.selection.color
    );
  }

  toDOM(): HTMLElement {
    const cursor = document.createElement("span");
    cursor.className = "cm-remote-cursor";
    cursor.dataset.userId = this.selection.userId;
    cursor.setAttribute("aria-label", `${this.selection.displayName} cursor`);
    cursor.style.setProperty("--remote-color", this.selection.color);

    const label = document.createElement("span");
    label.className = "cm-remote-cursor-label";
    label.textContent = this.selection.displayName;
    cursor.append(label);
    return cursor;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function buildRemoteDecorations(selections: readonly RemoteSelection[]): DecorationSet {
  const ranges: Array<{ from: number; to: number; decoration: Decoration; order: number }> = [];

  for (const selection of selections) {
    if (selection.from < selection.to) {
      ranges.push({
        from: selection.from,
        to: selection.to,
        order: 0,
        decoration: Decoration.mark({
          class: "cm-remote-selection",
          attributes: {
            "data-user-id": selection.userId,
            style: `--remote-color:${selection.color}`,
          },
        }),
      });
    }

    ranges.push({
      from: selection.head,
      to: selection.head,
      order: 1,
      decoration: Decoration.widget({
        widget: new RemoteCursorWidget(selection),
        side: selection.head === selection.to ? 1 : -1,
      }),
    });
  }

  ranges.sort(
    (left, right) => left.from - right.from || left.to - right.to || left.order - right.order,
  );

  const builder = new RangeSetBuilder<Decoration>();
  for (const range of ranges) builder.add(range.from, range.to, range.decoration);
  return builder.finish();
}

function clampPosition(value: number, length: number): number {
  const position = Number.isFinite(value) ? Math.trunc(value) : 0;
  return Math.max(0, Math.min(position, length));
}

function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}
