import { expect, test } from "bun:test";
import { TypeScriptImportIndex } from "./typescript-import-index";

test("tracks changed, removed and renamed source imports", async () => {
  const index = new TypeScriptImportIndex();
  expect(
    await index.getKey([
      { path: "app.ts", text: 'import "first";' },
      { path: "other.ts", text: 'export * from "second";' },
    ]),
  ).toBe('["first","second"]');
  expect(
    await index.getKey([
      { path: "renamed.ts", text: 'import "third";' },
      { path: "ignore.css", text: 'import "ignored";' },
    ]),
  ).toBe('["third"]');
  index.clear();
  expect(await index.getKey([])).toBe("[]");
});

test("yields to the event loop while indexing a code-dense workspace", async () => {
  const index = new TypeScriptImportIndex();
  let yielded = false;
  const timer = setTimeout(() => {
    yielded = true;
  }, 0);
  try {
    const text = 'import "pkg";\n' + "void Math.random();\n".repeat(1600);
    const files = Array.from({ length: 512 }, (_, id) => ({ path: `${id}.ts`, text }));
    expect(await index.getKey(files)).toBe('["pkg"]');
    expect(yielded).toBe(true);
    expect(await index.getKey(files.slice(1))).toBe('["pkg"]');
  } finally {
    clearTimeout(timer);
  }
});
