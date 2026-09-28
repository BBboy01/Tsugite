import { createBundledHighlighter, createSingletonShorthands } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

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
export type ShikiLanguage = "typescript" | "javascript" | "tsx" | "jsx" | "html" | "css" | "json";
export type HighlightInput = {
  source: string;
  language: ShikiLanguage;
  theme: ShikiTheme;
  from: number;
  to: number;
};
export type HighlightSpan = { from: number; to: number; color: string; fontStyle: number };

const createHighlighter = createBundledHighlighter({
  langs: {
    typescript: () => import("@shikijs/langs/typescript"),
    javascript: () => import("@shikijs/langs/javascript"),
    tsx: () => import("@shikijs/langs/tsx"),
    jsx: () => import("@shikijs/langs/jsx"),
    html: () => import("@shikijs/langs/html"),
    css: () => import("@shikijs/langs/css"),
    json: () => import("@shikijs/langs/json"),
  },
  themes: {
    "vitesse-light": () => import("@shikijs/themes/vitesse-light"),
    "vitesse-dark": () => import("@shikijs/themes/vitesse-dark"),
    "solarized-light": () => import("@shikijs/themes/solarized-light"),
    "solarized-dark": () => import("@shikijs/themes/solarized-dark"),
    "tokyo-night": () => import("@shikijs/themes/tokyo-night"),
    dracula: () => import("@shikijs/themes/dracula"),
    "catppuccin-latte": () => import("@shikijs/themes/catppuccin-latte"),
    "catppuccin-mocha": () => import("@shikijs/themes/catppuccin-mocha"),
    "github-light": () => import("@shikijs/themes/github-light"),
    "github-dark": () => import("@shikijs/themes/github-dark"),
    nord: () => import("@shikijs/themes/nord"),
    "gruvbox-dark-medium": () => import("@shikijs/themes/gruvbox-dark-medium"),
    "one-dark-pro": () => import("@shikijs/themes/one-dark-pro"),
    "rose-pine": () => import("@shikijs/themes/rose-pine"),
    "everforest-dark": () => import("@shikijs/themes/everforest-dark"),
    "kanagawa-wave": () => import("@shikijs/themes/kanagawa-wave"),
  },
  engine: () => createJavaScriptRegexEngine(),
});

const { codeToTokens } = createSingletonShorthands(createHighlighter);

export function highlightShikiTokens(source: string, language: ShikiLanguage, theme: ShikiTheme) {
  return codeToTokens(source, { lang: language, theme });
}

export class ShikiTokenCache {
  private cached:
    | {
        source: string;
        language: ShikiLanguage;
        theme: ShikiTheme;
        result: Awaited<ReturnType<typeof highlightShikiTokens>>;
      }
    | undefined;

  async highlight(input: HighlightInput): Promise<HighlightSpan[]> {
    const { source, language, theme, from, to } = input;
    if (
      !this.cached ||
      this.cached.source !== source ||
      this.cached.language !== language ||
      this.cached.theme !== theme
    ) {
      this.cached = {
        source,
        language,
        theme,
        result: await highlightShikiTokens(source, language, theme),
      };
    }
    const spans: HighlightSpan[] = [];
    for (const line of this.cached.result.tokens) {
      for (const token of line) {
        const end = token.offset + token.content.length;
        if (!token.content || end <= from || token.offset >= to) continue;
        spans.push({
          from: token.offset,
          to: end,
          color: token.color ?? "inherit",
          fontStyle: token.fontStyle ?? 0,
        });
      }
    }
    return spans;
  }
}
