import { expect, test } from "bun:test";
import { createTypeScriptIntelligence } from "./typescript-intelligence";
import {
  LatestIntelligenceRequest,
  matchesIntelligenceSnapshot,
  queryEditorLocations,
} from "./editor-navigation";

const source = "import { value } from './value';\nvalue;";
const files = [
  { path: "src/App.tsx", text: source },
  { path: "src/value.ts", text: "export const value = 1;" },
];

test("navigation synchronizes collaborative edits before its async query", async () => {
  const engine = createTypeScriptIntelligence("src/App.tsx", source, files);
  try {
    const result = await queryEditorLocations(
      engine,
      [files[0], { path: "src/value.ts", text: "\n\nexport const value = 2;" }],
      "src/App.tsx",
      source.lastIndexOf("value"),
      "definition",
    );
    expect(result).toMatchObject({
      status: "ok",
      value: [{ path: "src/value.ts", line: 3, column: 14 }],
    });
    const deleted = await queryEditorLocations(
      engine,
      [files[0]],
      "src/App.tsx",
      source.lastIndexOf("value"),
      "definition",
    );
    expect(
      deleted.status === "empty" ||
        (deleted.status === "ok" && deleted.value.every((item) => item.path !== "src/value.ts")),
    ).toBe(true);
  } finally {
    engine.dispose();
  }
});

test("navigation preserves empty and disposed results", async () => {
  const engine = createTypeScriptIntelligence("src/App.tsx", source, files);
  expect(
    await queryEditorLocations(engine, files, "src/App.tsx", source.length, "definition"),
  ).toEqual({ status: "empty" });
  engine.dispose();
  expect(await queryEditorLocations(engine, files, "src/App.tsx", 0, "references")).toEqual({
    status: "disposed",
  });
});

test("superseded and unmounted requests cannot apply awaited results", () => {
  const requests = new LatestIntelligenceRequest();
  const first = requests.begin();
  const second = requests.begin();
  expect(first()).toBe(false);
  expect(second()).toBe(true);
  requests.invalidate();
  expect(second()).toBe(false);
});

test("content snapshots detect active edits, additions, deletion and renames", () => {
  expect(matchesIntelligenceSnapshot(files, [...files].toReversed())).toBe(true);
  expect(
    matchesIntelligenceSnapshot(files, [
      files[0],
      { ...files[1], text: "export const value = 3;" },
    ]),
  ).toBe(false);
  expect(matchesIntelligenceSnapshot(files, [files[0]])).toBe(false);
  expect(matchesIntelligenceSnapshot(files, [...files, { path: "new.ts", text: "" }])).toBe(false);
  expect(matchesIntelligenceSnapshot(files, [files[0], { ...files[1], path: "renamed.ts" }])).toBe(
    false,
  );
});
