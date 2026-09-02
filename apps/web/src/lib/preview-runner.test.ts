import { expect, test } from "bun:test";

import { createPreviewDocument, runPreview, transpileSource } from "./preview-runner";

test("transpiles TypeScript source for the preview", () => {
  const code = transpileSource("const count: number = 2\nconsole.log(count)", "typescript");

  expect(code).toContain("const count = 2");
  expect(code).not.toContain(": number");
});

test("creates an iframe document with the console bridge", () => {
  const document = createPreviewDocument("console.log('hello')");

  expect(document).toContain("source: 'iris-preview'");
  expect(document).toContain("console.log =");
  expect(document).toContain("console.log('hello')");
});

test("returns preview errors without throwing", () => {
  const result = runPreview("const =", "javascript");

  expect(result.code).toBeUndefined();
  expect(result.error).toBeDefined();
});
