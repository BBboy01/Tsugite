import { expect, test } from "bun:test";

import { fuzzyMatchFiles, fuzzyMatchIndexes } from "./file-fuzzy-search";

test("ranks fuzzy file matches by path relevance", () => {
  const files = [
    { id: "1", path: "src/main.tsx" },
    { id: "2", path: "src/components/file-tree.tsx" },
    { id: "3", path: "README.md" },
  ] as never[];
  expect(fuzzyMatchFiles(files, "main").map((file) => file.path)).toEqual(["src/main.tsx"]);
  expect(fuzzyMatchFiles(files, "tsx").map((file) => file.path)).toEqual([
    "src/main.tsx",
    "src/components/file-tree.tsx",
  ]);
  expect(fuzzyMatchIndexes("src/main.tsx", "main")).toEqual([4, 5, 6, 7]);
});
