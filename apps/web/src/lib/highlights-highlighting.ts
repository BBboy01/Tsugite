import { RangeSetBuilder, StateEffect } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";

import type { HighlightEdit, HighlightsLanguage } from "./highlights-engine";
import { HighlightsWorkerClient } from "./highlights-worker-client";
import type { WorkspaceTheme } from "@iris/shared";

const setHighlightsDecorations = StateEffect.define<DecorationSet>();
export const setHighlightsTheme = StateEffect.define<WorkspaceTheme>();
const highlighter = new HighlightsWorkerClient();

export function highlightsHighlight(
  language: HighlightsLanguage,
  theme: WorkspaceTheme,
  onReady?: () => void,
) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet = Decoration.none;
      private requestId = 0;
      private ready = false;
      private theme = theme;
      private readonly scopeId = highlighter.createScope();

      constructor(view: EditorView) {
        void this.highlight(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged) this.decorations = this.decorations.map(update.changes);
        for (const effect of update.transactions.flatMap((transaction) => transaction.effects)) {
          if (effect.is(setHighlightsDecorations)) this.decorations = effect.value;
          if (effect.is(setHighlightsTheme)) {
            this.theme = effect.value;
            highlighter.cancelInFlight(this.scopeId);
            void this.highlight(update.view);
          }
        }
        if (update.docChanged || update.viewportChanged) void this.highlight(update.view, update);
      }

      destroy() {
        this.requestId += 1;
        highlighter.cancelInFlight(this.scopeId);
      }

      private async highlight(view: EditorView, update?: ViewUpdate) {
        const requestId = ++this.requestId;
        const viewport = getHighlightViewport(view);
        const spans = await highlighter.highlight(
          {
            source: view.state.doc.toString(),
            edits: update?.docChanged ? getHighlightEdits(update) : [],
            language,
            theme: this.theme,
            viewport: viewport.range,
            lineOffsets: viewport.offsets,
          },
          this.scopeId,
        );
        if (!spans || requestId !== this.requestId || !view.dom.isConnected) return;

        const builder = new RangeSetBuilder<Decoration>();
        for (const span of spans) {
          builder.add(
            span.from,
            span.to,
            Decoration.mark({
              class: "cm-shiki",
              attributes: {
                style: formatHighlightsTokenStyle(span.color, span.fontStyle),
              },
            }),
          );
        }
        if (requestId !== this.requestId || !view.dom.isConnected) return;
        view.dispatch({ effects: setHighlightsDecorations.of(builder.finish()) });
        if (!this.ready) {
          this.ready = true;
          onReady?.();
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
    },
  );
}

export function formatHighlightsTokenStyle(color: string, fontStyle: number): string {
  const styles = [`color:${color}`];
  if (fontStyle & 1) styles.push("font-style:italic");
  if (fontStyle & 2) styles.push("font-weight:700");
  if (fontStyle & 4) styles.push("text-decoration:underline");
  return styles.join(";");
}

function getHighlightViewport(view: EditorView): {
  range: readonly [startLine: number, endLine: number];
  offsets: readonly number[];
} {
  const startLine = view.state.doc.lineAt(view.viewport.from).number - 1;
  const endLine = view.state.doc.lineAt(view.viewport.to).number;
  const offsets: number[] = [];
  for (let line = startLine; line < endLine; line += 1) {
    offsets.push(view.state.doc.line(line + 1).from);
  }
  return { range: [startLine, endLine], offsets };
}

function getHighlightEdits(update: ViewUpdate): HighlightEdit[] {
  const edits: HighlightEdit[] = [];
  update.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    const start = update.startState.doc.lineAt(fromA);
    const end = update.startState.doc.lineAt(toA);
    edits.push({
      range: {
        start: { line: start.number - 1, character: fromA - start.from },
        end: { line: end.number - 1, character: toA - end.from },
      },
      newText: update.state.doc.sliceString(fromB, toB),
    });
  });
  return edits;
}
