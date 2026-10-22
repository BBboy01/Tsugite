import { hoverTooltip, ViewPlugin, type TooltipView } from "@codemirror/view";
import type { WorkspaceTheme } from "@iris/shared";
import type { EditorIntelligence, IntelligenceHover } from "./editor-intelligence";
import {
  createHighlightsSession,
  type HighlightsLanguage,
  type HighlightSpan,
  type HighlightsTokenizerSession,
} from "./highlights-engine";
import { LatestIntelligenceRequest } from "./editor-navigation";

type HoverTheme = () => WorkspaceTheme;

const DEFAULT_THEME: WorkspaceTheme = "paper";

const LANGUAGE_ALIASES: Record<string, HighlightsLanguage> = {
  css: "css",
  html: "html",
  javascript: "javascript",
  js: "javascript",
  jsx: "jsx",
  json: "json",
  ts: "typescript",
  tsx: "tsx",
  typescript: "typescript",
};

function codeLanguage(value: string | undefined): HighlightsLanguage {
  return LANGUAGE_ALIASES[value?.toLowerCase() ?? ""] ?? "typescript";
}

function appendInlineMarkdown(parent: HTMLElement, text: string, getTheme: HoverTheme): void {
  const inlineCode = /`([^`\n]+)`/g;
  let cursor = 0;
  for (const match of text.matchAll(inlineCode)) {
    const start = match.index ?? 0;
    if (start > cursor) parent.append(document.createTextNode(text.slice(cursor, start)));
    const code = document.createElement("code");
    code.className = "iris-ts-hover-code";
    const source = match[1] ?? "";
    code.textContent = source;
    parent.append(code);
    void highlightCode(code, source, "typescript", getTheme);
    cursor = start + match[0].length;
  }
  if (cursor < text.length) parent.append(document.createTextNode(text.slice(cursor)));
}

function appendMarkdown(parent: HTMLElement, documentation: string, getTheme: HoverTheme): void {
  const lines = documentation.replace(/\r\n?/g, "\n").split("\n");
  let paragraph: string[] = [];
  let codeLines: string[] | undefined;
  let codeLanguageName: string | undefined;
  let fenceCharacter = "";
  let fenceLength = 0;

  const appendParagraph = () => {
    if (!paragraph.length) return;
    const element = document.createElement("p");
    appendInlineMarkdown(element, paragraph.join("\n"), getTheme);
    parent.append(element);
    paragraph = [];
  };

  const appendCode = () => {
    if (!codeLines) return;
    const pre = document.createElement("pre");
    pre.className = "iris-ts-hover-code-block";
    const code = document.createElement("code");
    code.className = "iris-ts-hover-code";
    const source = codeLines.join("\n");
    code.textContent = source;
    pre.append(code);
    parent.append(pre);
    void highlightCode(code, source, codeLanguage(codeLanguageName), getTheme);
    codeLines = undefined;
    codeLanguageName = undefined;
    fenceCharacter = "";
    fenceLength = 0;
  };

  for (const line of lines) {
    const fence = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (codeLines) {
      if (
        fence &&
        fence[1]?.[0] === fenceCharacter &&
        fence[1].length >= fenceLength &&
        !fence[2]?.trim()
      ) {
        appendCode();
      } else {
        codeLines.push(line);
      }
      continue;
    }
    if (fence) {
      appendParagraph();
      codeLines = [];
      fenceCharacter = fence[1]?.[0] ?? "`";
      fenceLength = fence[1]?.length ?? 3;
      codeLanguageName = fence[2]?.trim().split(/\s+/)[0];
    } else if (!line.trim()) {
      appendParagraph();
    } else {
      paragraph.push(line);
    }
  }
  if (codeLines) appendCode();
  appendParagraph();
}

function applyTokenStyle(element: HTMLElement, span: HighlightSpan): void {
  element.style.color = span.color;
  if (span.fontStyle & 1) element.style.fontStyle = "italic";
  if (span.fontStyle & 2) element.style.fontWeight = "700";
  if (span.fontStyle & 4) element.style.textDecoration = "underline";
}

async function highlightCode(
  element: HTMLElement,
  source: string,
  language: HighlightsLanguage,
  getTheme: HoverTheme,
): Promise<void> {
  if (!source) return;
  let session: HighlightsTokenizerSession | undefined;
  try {
    const lineOffsets = [0];
    for (let index = 0; index < source.length; index += 1) {
      if (source[index] === "\n") lineOffsets.push(index + 1);
    }
    const lineCount = lineOffsets.length;
    session = await createHighlightsSession(source, language, getTheme(), [0, lineCount]);
    const spans = session.highlight([0, lineCount], lineOffsets);
    if (!element.isConnected) return;

    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const span of spans) {
      if (span.from < cursor) continue;
      if (span.from > cursor)
        fragment.append(document.createTextNode(source.slice(cursor, span.from)));
      const token = document.createElement("span");
      token.className = "iris-ts-hover-code-token";
      token.textContent = source.slice(span.from, span.to);
      applyTokenStyle(token, span);
      fragment.append(token);
      cursor = span.to;
    }
    if (cursor < source.length) fragment.append(document.createTextNode(source.slice(cursor)));
    element.replaceChildren(fragment);
  } catch {
    // The code remains readable with the CSS fallback if tokenization is unavailable.
  } finally {
    session?.dispose();
  }
}

export const renderTypeScriptHover = (
  info: IntelligenceHover,
  getTheme: HoverTheme = () => DEFAULT_THEME,
): TooltipView => {
  const dom = document.createElement("div");
  dom.className = "iris-ts-hover";
  if (info.signature) {
    const signature = document.createElement("code");
    signature.className = "iris-ts-hover-signature";
    signature.textContent = info.signature;
    dom.append(signature);
    void highlightCode(signature, info.signature, "typescript", getTheme);
  }
  if (info.documentation) {
    const description = document.createElement("div");
    description.className = "iris-ts-hover-description";
    appendMarkdown(description, info.documentation, getTheme);
    dom.append(description);
  }
  return { dom };
};

export function typeScriptHover(
  intelligence: EditorIntelligence,
  path: string,
  getTheme: HoverTheme = () => DEFAULT_THEME,
) {
  const requests = new LatestIntelligenceRequest();
  return [
    ViewPlugin.define(() => ({ destroy: () => requests.invalidate() })),
    hoverTooltip(async (view, position) => {
      const isCurrent = requests.begin();
      const doc = view.state.doc;
      const workspaceVersion = intelligence.workspaceVersion;
      try {
        const result = await intelligence.hover({ path, position });
        if (
          !isCurrent() ||
          view.state.doc !== doc ||
          workspaceVersion !== intelligence.workspaceVersion ||
          result.status !== "ok"
        )
          return null;
        return {
          pos: result.value.from,
          end: result.value.to,
          create: () => renderTypeScriptHover(result.value, getTheme),
        };
      } catch {
        return null;
      }
    }),
  ];
}
