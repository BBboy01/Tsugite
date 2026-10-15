import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { loadTypeScriptStandardLibrary } from "./typescript-standard-library";
import { createEditorTypeScriptEnvironment } from "./typescript-environment";

const readInstalled = (name: string) =>
  readFile(new URL(`../../../../node_modules/${name}`, import.meta.url), "utf8");
const readStandardLibrary = (name: string) => readInstalled(`typescript-legacy/lib/${name}`);

test("loads official standard libraries and their transitive dependencies without duplicates", async () => {
  const files = await loadTypeScriptStandardLibrary(readStandardLibrary);
  const paths = files.map((file) => file.path);
  expect(paths).toContain("__typescript/lib/lib.es2022.full.d.ts");
  expect(paths).toContain("__typescript/lib/lib.es5.d.ts");
  expect(paths).toContain("__typescript/lib/lib.dom.d.ts");
  expect(new Set(paths).size).toBe(paths.length);
  const source =
    "const result = Promise.resolve([1, 2].map(String));\ndocument.body.textContent = result.toString();";
  const environment = createEditorTypeScriptEnvironment("app.ts", source, [], files);
  try {
    expect(environment.languageService.getSemanticDiagnostics("/app.ts")).toHaveLength(0);
    const info = environment.languageService.getQuickInfoAtPosition(
      "/app.ts",
      source.indexOf("result"),
    );
    expect(info?.displayParts?.map((part) => part.text).join("")).toBe(
      "const result: Promise<string[]>",
    );
  } finally {
    environment.languageService.dispose();
  }
});

test("fails explicitly when a required official declaration asset is unavailable", async () => {
  await expect(
    loadTypeScriptStandardLibrary(async () => {
      throw new Error("missing asset");
    }),
  ).rejects.toThrow("missing asset");
});

test("compiler host resolves third-party package type entries", () => {
  const source = 'import { answer } from "typed-pkg";\nconst value: string = answer;';
  const environment = createEditorTypeScriptEnvironment(
    "src/app.ts",
    source,
    [
      { path: "node_modules/typed-pkg/package.json", text: '{"types":"types/index.d.ts"}' },
      {
        path: "node_modules/typed-pkg/types/index.d.ts",
        text: 'export declare const answer: "correct";',
      },
    ],
    [],
  );
  try {
    const info = environment.languageService.getQuickInfoAtPosition(
      "/src/app.ts",
      source.lastIndexOf("answer"),
    );
    expect(info?.displayParts?.map((part) => part.text).join("")).toContain('"correct"');
    expect(environment.languageService.getSemanticDiagnostics("/src/app.ts")).toHaveLength(0);
  } finally {
    environment.languageService.dispose();
  }
});

test("compiler host resolves installed React declarations and checks real JSX props", async () => {
  const libraries = await loadTypeScriptStandardLibrary(readStandardLibrary);
  const paths = [
    "@types/react/package.json",
    "@types/react/index.d.ts",
    "@types/react/global.d.ts",
    "csstype/package.json",
    "csstype/index.d.ts",
  ];
  const require = createRequire(import.meta.url);
  const reactRequire = createRequire(require.resolve("@types/react/package.json"));
  const files = await Promise.all(
    paths.map(async (name) => ({
      path: `node_modules/${name}`,
      text: name.startsWith("csstype/")
        ? await readFile(reactRequire.resolve(name), "utf8")
        : await readInstalled(name),
    })),
  );
  const source =
    'import * as React from "react";\nexport const App = () => { const [count] = React.useState(1); return <button type="button">{count.toFixed()}</button>; };';
  const environment = createEditorTypeScriptEnvironment("src/app.tsx", source, files, libraries);
  try {
    expect(environment.languageService.getSemanticDiagnostics("/src/app.tsx")).toHaveLength(0);
    const info = environment.languageService.getQuickInfoAtPosition(
      "/src/app.tsx",
      source.lastIndexOf("count"),
    );
    expect(info?.displayParts?.map((part) => part.text).join("")).toContain("count: number");
    environment.updateFile(
      "/src/app.tsx",
      source.replace('type="button"', 'type="not-a-button-type"'),
    );
    expect(
      environment.languageService
        .getSemanticDiagnostics("/src/app.tsx")
        .some((diagnostic) => diagnostic.code === 2322),
    ).toBe(true);
  } finally {
    environment.languageService.dispose();
  }
});
