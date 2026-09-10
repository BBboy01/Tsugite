import { expect, test } from "bun:test";

import type { ProjectFile } from "@iris/shared";

import { buildEditorTabViewModels } from "./editor-tab-model";

const file = (path: string, id: string): ProjectFile =>
  ({
    id,
    path,
    language: "typescript",
    text: { toString: () => "" } as ProjectFile["text"],
    kind: "file",
  }) as ProjectFile;

test("builds stable tab presentation data", () => {
  const tabs = [file("src/main.tsx", "one"), file("src/App.tsx", "two")];
  const models = buildEditorTabViewModels(tabs, "src/main.tsx", [], "me");
  expect(
    models.map(({ label, active, collaboratorCount }) => ({ label, active, collaboratorCount })),
  ).toEqual([
    { label: "main.tsx", active: true, collaboratorCount: 0 },
    { label: "App.tsx", active: false, collaboratorCount: 0 },
  ]);
});
