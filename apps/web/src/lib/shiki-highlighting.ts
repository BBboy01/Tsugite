import { codeToTokens } from "shiki";
import { RangeSetBuilder, StateEffect } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";

export type ShikiTheme =
  | "vitesse-light"
  | "vitesse-dark"
  | "solarized-light"
  | "solarized-dark"
  | "tokyo-night"
  | "dracula"
  | "catppuccin-latte"
  | "catppuccin-mocha"
  | "github-light"
  | "github-dark"
  | "nord"
  | "gruvbox-dark-medium"
  | "one-dark-pro"
  | "rose-pine"
  | "everforest-dark"
  | "kanagawa-wave";
type ShikiLanguage = "typescript" | "javascript" | "tsx" | "jsx" | "html" | "css" | "json";
const setShikiDecorations = StateEffect.define<DecorationSet>();

export function shikiHighlight(language: ShikiLanguage, theme: ShikiTheme) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet = Decoration.none;
      private requestId = 0;

      constructor(view: EditorView) {
        void this.highlight(view);
      }

      update(update: ViewUpdate) {
        for (const effect of update.transactions.flatMap((transaction) => transaction.effects)) {
          if (effect.is(setShikiDecorations)) this.decorations = effect.value;
        }
        if (update.docChanged) void this.highlight(update.view);
      }

      private async highlight(view: EditorView) {
        const requestId = ++this.requestId;
        const source = view.state.doc.toString();
        let result;
        try {
          result = await codeToTokens(source, { lang: language, theme });
        } catch {
          if (requestId === this.requestId && view.dom.isConnected) {
            view.dispatch({ effects: setShikiDecorations.of(Decoration.none) });
          }
          return;
        }
        if (requestId !== this.requestId || view.dom.ownerDocument.defaultView === null) return;

        const builder = new RangeSetBuilder<Decoration>();
        for (const line of result.tokens) {
          for (const token of line) {
            if (!token.content) continue;
            const start = token.offset;
            const end = start + token.content.length;
            builder.add(
              start,
              end,
              Decoration.mark({
                attributes: {
                  style: formatShikiTokenStyle(token.color ?? "inherit", token.fontStyle ?? 0),
                },
              }),
            );
          }
        }
        if (requestId !== this.requestId || !view.dom.isConnected) return;
        view.dispatch({ effects: setShikiDecorations.of(builder.finish()) });
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
