import { expect, test } from "playwright/test";

test("import indexing yields and reuses unchanged files in a code-dense maximum workspace", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/import-index-benchmark", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<title>Import index benchmark</title>",
    }),
  );
  await page.goto("/import-index-benchmark");
  const result = await page.evaluate(async () => {
    const modulePath = "/src/lib/typescript-import-index.ts";
    const { TypeScriptImportIndex } = (await import(modulePath)) as {
      TypeScriptImportIndex: new () => {
        getKey(files: { path: string; text: string }[]): Promise<string>;
      };
    };
    const index = new TypeScriptImportIndex();
    const text = ('import "pkg";\n' + "void Math.random();\n".repeat(1600)).padEnd(32768, " ");
    const files = Array.from({ length: 512 }, (_, id) => ({ path: `${id}.ts`, text }));
    let yielded = false;
    let previous = performance.now();
    let longestGapMs = 0;
    const timer = setInterval(() => {
      yielded = true;
      const now = performance.now();
      longestGapMs = Math.max(longestGapMs, now - previous);
      previous = now;
    }, 0);
    try {
      let started = performance.now();
      const coldKey = await index.getKey(files);
      const coldMs = performance.now() - started;
      started = performance.now();
      const cachedKey = await index.getKey(files);
      const cachedMs = performance.now() - started;
      files[0] = { path: "0.ts", text: text.replace('"pkg"', '"new"') };
      started = performance.now();
      const editedKey = await index.getKey(files);
      const singleEditMs = performance.now() - started;
      return {
        coldKey,
        cachedKey,
        editedKey,
        yielded,
        coldMs,
        cachedMs,
        singleEditMs,
        longestGapMs,
        files: files.length,
        sourceBytes: new TextEncoder().encode(text).byteLength * files.length,
      };
    } finally {
      clearInterval(timer);
    }
  });
  expect(result.files).toBe(512);
  expect(result.sourceBytes).toBe(16 * 1024 * 1024);
  expect(result.coldKey).toBe('["pkg"]');
  expect(result.cachedKey).toBe(result.coldKey);
  expect(result.editedKey).toBe('["new","pkg"]');
  expect(result.yielded).toBe(true);
  expect(errors).toEqual([]);
  await testInfo.attach("typescript-import-index.json", {
    body: JSON.stringify(result, null, 2),
    contentType: "application/json",
  });
});
