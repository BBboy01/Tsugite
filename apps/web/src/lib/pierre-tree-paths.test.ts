import { expect, test } from "bun:test";
import { toPierreTreePaths } from "./pierre-tree-paths";

test("maps Loro files and explicit folders to Pierre canonical paths", () => {
  expect(toPierreTreePaths(["src/main.ts"], ["assets", "src/empty"])).toEqual([
    "assets/",
    "src/",
    "src/empty/",
    "src/main.ts",
  ]);
});

test("deduplicates folders already inferred from file paths", () => {
  expect(toPierreTreePaths(["src/main.ts"], ["src", "src"])).toEqual([
    "src/",
    "src/main.ts",
  ]);
});
