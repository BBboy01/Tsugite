import { LiveTokenizer, type Lang, type Theme, type LiveTextEdit } from "@pierre/highlights";
import type { WorkspaceTheme } from "@iris/shared";

import { getHighlightsTheme } from "./workspace-theme";

export type HighlightsLanguage =
  | "typescript"
  | "javascript"
  | "tsx"
  | "jsx"
  | "html"
  | "css"
  | "json";

export type HighlightViewport = readonly [startLine: number, endLine: number];

export type HighlightEdit = LiveTextEdit;

export type HighlightSpan = {
  from: number;
  to: number;
  color: string;
  fontStyle: number;
};

const HIGHLIGHTS_LANGUAGES: Record<HighlightsLanguage, Lang> = {
  typescript: "ts",
  javascript: "js",
  tsx: "tsx",
  jsx: "jsx",
  html: "html",
  css: "css",
  json: "json",
};

export async function createHighlightsSession(
  source: string,
  language: HighlightsLanguage,
  theme: WorkspaceTheme,
  renderRange: HighlightViewport,
): Promise<HighlightsTokenizerSession> {
  const highlightsTheme = await getHighlightsTheme(theme);
  return new HighlightsTokenizerSession(source, language, highlightsTheme, renderRange);
}

export class HighlightsTokenizerSession {
  private readonly tokenizer: LiveTokenizer;

  constructor(
    source: string,
    language: HighlightsLanguage,
    theme: Theme,
    renderRange: HighlightViewport,
  ) {
    this.tokenizer = new LiveTokenizer({
      code: source,
      lang: HIGHLIGHTS_LANGUAGES[language],
      theme,
      renderRange,
    });
  }

  highlight(viewport: HighlightViewport, lineOffsets: readonly number[]): HighlightSpan[] {
    this.tokenizer.applyEdits([], { renderRange: viewport });
    return this.serialize(viewport, lineOffsets);
  }

  applyEdits(
    edits: readonly HighlightEdit[],
    viewport: HighlightViewport,
    lineOffsets: readonly number[],
  ): HighlightSpan[] {
    this.tokenizer.applyEdits(edits, { renderRange: viewport });
    return this.serialize(viewport, lineOffsets);
  }

  getText(): string {
    return this.tokenizer.getText();
  }

  getLineText(line: number): string {
    return this.tokenizer.getLineText(line);
  }

  dispose(): void {
    this.tokenizer.dispose();
  }

  private serialize(
    [startLine, endLine]: HighlightViewport,
    lineOffsets: readonly number[],
  ): HighlightSpan[] {
    const spans: HighlightSpan[] = [];
    for (let line = startLine; line < endLine; line += 1) {
      const lineOffset = lineOffsets[line - startLine];
      if (lineOffset === undefined) {
        throw new RangeError(`Missing absolute offset for highlighted line ${line}`);
      }
      for (const token of this.tokenizer.getLineTokens(line).tokens) {
        if (token.content.length === 0) continue;
        spans.push({
          from: lineOffset + token.offset,
          to: lineOffset + token.offset + token.content.length,
          color: token.color ?? "inherit",
          fontStyle: token.fontStyle ?? 0,
        });
      }
    }
    return spans;
  }
}
