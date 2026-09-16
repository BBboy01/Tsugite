import { expect, test } from "bun:test";
import { createEditorTypeScriptEnvironment } from "./typescript-environment";
import { queryEditorLocations } from "./editor-navigation";

const source =
  "import { value, type Shape } from './value';\nconst shape: Shape = { size: value };\nvalue;";
const files = [
  { path: "src/App.tsx", text: source },
  {
    path: "src/value.ts",
    text: "export interface Shape { size: number }\nexport const value = 1;",
  },
];

test("returns cross-file definitions and all references with source coordinates", () => {
  const env = createEditorTypeScriptEnvironment("src/App.tsx", source, files);
  const definitions = queryEditorLocations(
    env,
    files,
    "src/App.tsx",
    source.lastIndexOf("value"),
    "definition",
  );
  expect(definitions).toHaveLength(1);
  expect(definitions[0]).toMatchObject({ path: "src/value.ts", line: 2, column: 14 });
  const references = queryEditorLocations(
    env,
    files,
    "src/App.tsx",
    source.lastIndexOf("value"),
    "references",
  );
  expect(references.filter((item) => item.path === "src/App.tsx")).toHaveLength(3);
  expect(references.some((item) => item.path === "src/value.ts")).toBe(true);
  env.languageService.dispose();
});

test("synchronizes edited and removed files before queries", () => {
  const env = createEditorTypeScriptEnvironment("src/App.tsx", source, files);
  const edited = [files[0], { path: "src/value.ts", text: "\n\nexport const value = 2;" }];
  expect(
    queryEditorLocations(env, edited, "src/App.tsx", source.lastIndexOf("value"), "definition")[0]
      ?.line,
  ).toBe(3);
  const afterDelete = queryEditorLocations(
    env,
    [files[0]],
    "src/App.tsx",
    source.lastIndexOf("value"),
    "definition",
  );
  expect(afterDelete.some((item) => item.path === "src/value.ts")).toBe(false);
  env.languageService.dispose();
});

test("queries type definitions and implementations and handles empty targets", () => {
  const text =
    "interface Shape { size: number }\nclass Box implements Shape { size = 1 }\nconst shape: Shape = new Box();\nshape;";
  const items = [{ path: "types.ts", text }];
  const env = createEditorTypeScriptEnvironment("types.ts", text, items);
  expect(
    queryEditorLocations(env, items, "types.ts", text.lastIndexOf("shape"), "type")[0]?.line,
  ).toBe(1);
  expect(
    queryEditorLocations(env, items, "types.ts", text.indexOf("Shape"), "implementation").some(
      (item) => item.line === 2,
    ),
  ).toBe(true);
  expect(queryEditorLocations(env, items, "types.ts", text.length, "definition")).toEqual([]);
  env.languageService.dispose();
});
