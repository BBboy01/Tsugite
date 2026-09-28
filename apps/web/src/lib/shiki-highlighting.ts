import { RangeSetBuilder, StateEffect } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";

import type { ShikiLanguage, ShikiTheme } from "./shiki-engine";
import { ShikiWorkerClient } from "./shiki-worker-client";

export type { ShikiTheme } from "./shiki-engine";
const setShikiDecorations = StateEffect.define<DecorationSet>();
const highlighter = new ShikiWorkerClient();

export function shikiHighlight(language: ShikiLanguage, theme: ShikiTheme, onReady?: () => void) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet = Decoration.none;
      private requestId = 0;

      constructor(view: EditorView) {
        void this.highlight(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged) this.decorations = this.decorations.map(update.changes);
        for (const effect of update.transactions.flatMap((transaction) => transaction.effects)) {
          if (effect.is(setShikiDecorations)) this.decorations = effect.value;
        }
        if (update.docChanged || update.viewportChanged) void this.highlight(update.view);
      }

      destroy() {
        this.requestId++;
        highlighter.cancelInFlight();
      }

      private async highlight(view: EditorView) {
        const requestId = ++this.requestId;
        const source = view.state.doc.toString();
        const spans = await highlighter.highlight({
          source,
          language,
          theme,
          ...view.viewport,
        });
        if (!spans || requestId !== this.requestId || !view.dom.isConnected) return;

        const builder = new RangeSetBuilder<Decoration>();
        for (const span of spans) {
          builder.add(
            span.from,
            span.to,
            Decoration.mark({
              class: "cm-shiki",
              attributes: {
                style: formatShikiTokenStyle(span.color, span.fontStyle),
              },
            }),
          );
        }
        if (requestId !== this.requestId || !view.dom.isConnected) return;
        view.dispatch({ effects: setShikiDecorations.of(builder.finish()) });
        onReady?.();
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
    },
  );
}

export function formatShikiTokenStyle(color: string, fontStyle: number): string {
  const styles = [`color:${color}`];
  if (fontStyle & 1) styles.push("font-style:italic");
  if (fontStyle & 2) styles.push("font-weight:700");
  if (fontStyle & 4) styles.push("text-decoration:underline");
  return styles.join(";");
}
