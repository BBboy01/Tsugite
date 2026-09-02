import { expect, test } from "bun:test";

import { getEditorLanguage, supportsTypeScriptServices } from "./editor-language";

test("recognizes common frontend file extensions", () => {
  expect(getEditorLanguage("index.html", "javascript")).toBe("html");
  expect(getEditorLanguage("src/styles.css", "typescript")).toBe("css");
  expect(getEditorLanguage("package.json", "javascript")).toBe("json");
  expect(getEditorLanguage("src/main.ts", "javascript")).toBe("typescript");
  expect(getEditorLanguage("src/main.jsx", "typescript")).toBe("jsx");
});

test("only script languages use TypeScript services", () => {
  expect(supportsTypeScriptServices("typescript")).toBe(true);
  expect(supportsTypeScriptServices("javascript")).toBe(true);
  expect(supportsTypeScriptServices("html")).toBe(false);
  expect(supportsTypeScriptServices("css")).toBe(false);
  expect(supportsTypeScriptServices("json")).toBe(false);
});
