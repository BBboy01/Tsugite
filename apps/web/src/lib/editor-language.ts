import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import type { LanguageSupport } from "@codemirror/language";

import type { FileLanguage } from "@iris/shared";

export type EditorLanguage = "typescript" | "javascript" | "tsx" | "jsx" | "html" | "css" | "json";

export function getEditorLanguage(path: string, fallback: FileLanguage): EditorLanguage {
  const extension = path.toLowerCase().split(".").at(-1);
  if (extension === "ts") return "typescript";
  if (extension === "tsx") return "tsx";
  if (extension === "js" || extension === "mjs" || extension === "cjs") return "javascript";
  if (extension === "jsx") return "jsx";
  if (extension === "html" || extension === "htm" || extension === "xhtml") return "html";
  if (extension === "css" || extension === "scss") return "css";
  if (extension === "json" || extension === "jsonc") return "json";
  return fallback;
}

export function supportsTypeScriptServices(language: EditorLanguage): boolean {
  return (
    language === "typescript" ||
    language === "javascript" ||
    language === "tsx" ||
    language === "jsx"
  );
}

export function getEditorLanguageSupport(language: EditorLanguage): LanguageSupport {
  switch (language) {
    case "html":
      return html();
    case "css":
      return css();
    case "json":
      return json();
    case "tsx":
      return javascript({ jsx: true, typescript: true });
    case "jsx":
      return javascript({ jsx: true });
    case "typescript":
      return javascript({ typescript: true });
    default:
      return javascript();
  }
}
