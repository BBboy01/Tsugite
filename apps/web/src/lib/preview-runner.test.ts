import { expect, test } from "bun:test";

import {
  createPreviewDocument,
  runPreview,
  transpileSource,
  validateSourceSyntax,
  validateSourceSyntaxDetails,
} from "./preview-runner";

test("transpiles TypeScript source for the preview", () => {
  const code = transpileSource("const count: number = 2\nconsole.log(count)", "typescript");

  expect(code).toContain("const count = 2");
  expect(code).not.toContain(": number");
});

test("preserves Babel syntax locations without changing string error consumers", () => {
  const source = "const ready = true;\nconst broken = ;";
  const result = runPreview(source, "typescript");
  expect(result.error).toContain("Unexpected token");
  expect(result.location).toEqual({ line: 2, column: 16, offset: 35 });
  expect(validateSourceSyntax(source, "typescript")).toContain("Unexpected token");
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

test("validates JSX and TypeScript syntax before preview sync", () => {
  expect(validateSourceSyntax("export const App = () => <main />", "typescript")).toBeUndefined();
  expect(validateSourceSyntax("export const broken = ;", "typescript")).toContain(
    "Unexpected token",
  );
});

test("project syntax preflight leaves non-script resources to the project compiler", () => {
  for (const [path, source] of [
    ["index.html", "<!doctype html><main />"],
    ["package.json", '{"name":"example"}'],
    ["src/index.css", "body { color: red; }"],
  ]) {
    expect(validateSourceSyntaxDetails(source, "typescript", path)).toBeUndefined();
  }
  expect(
    validateSourceSyntaxDetails("export const broken = ;", "typescript", "src/App.tsx")?.message,
  ).toContain("Unexpected token");
});
