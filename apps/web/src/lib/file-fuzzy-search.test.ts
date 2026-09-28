import { expect, test } from "bun:test";

import {
  FILE_SEARCH_RESULT_LIMIT,
  fuzzyMatchFiles,
  fuzzyMatchIndexes,
  getFileSearchResults,
} from "./file-fuzzy-search";

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

test("limits displayed file search results without losing the total or ranking", () => {
  const files = [
    { id: "1", path: "src/feature/map.tsx" },
    { id: "2", path: "src/main.tsx" },
    { id: "3", path: "docs/main-guide.tsx" },
  ] as never[];

  expect(getFileSearchResults(files, "main", 1)).toEqual({
    files: [files[1]],
    total: 2,
  });
});

test("caps default search results at the display limit", () => {
  const files = Array.from({ length: FILE_SEARCH_RESULT_LIMIT + 5 }, (_, index) => ({
    id: String(index),
    path: `src/file-${index}.tsx`,
  })) as never[];
  const result = getFileSearchResults(files, "tsx");

  expect(result.total).toBe(files.length);
  expect(result.files).toHaveLength(FILE_SEARCH_RESULT_LIMIT);
  expect(result.files[0]).toBe(files[0]);
  expect(result.files.at(-1)).toBe(files[FILE_SEARCH_RESULT_LIMIT - 1]);
});
