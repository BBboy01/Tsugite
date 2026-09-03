import { expect, test } from "bun:test";

import { getRemoteSelections } from "./remote-presence";

test("keeps only other collaborators editing the active file", () => {
  const selections = getRemoteSelections(
    [
      {
        userId: "self",
        displayName: "Maya",
        color: "#d88961",
        selectedPath: "src/main.tsx",
        cursor: { anchor: 1, head: 2 },
      },
      {
        userId: "jun",
        displayName: "Jun",
        color: "#7389b7",
        selectedPath: "src/main.tsx",
        cursor: { anchor: 4, head: 2 },
      },
      {
        userId: "sora",
        displayName: "Sora",
        color: "#5d9f8c",
        selectedPath: "README.md",
        cursor: { anchor: 0, head: 1 },
      },
    ],
    "self",
    "src/main.tsx",
    10,
  );

  expect(selections).toEqual([
    {
      userId: "jun",
      displayName: "Jun",
      color: "#7389b7",
      from: 2,
      to: 4,
      head: 2,
    },
  ]);
});

test("clamps invalid positions and preserves a collapsed cursor", () => {
  expect(
    getRemoteSelections(
      [
        {
          userId: "jun",
          displayName: "Jun",
          color: "#7389b7",
          selectedPath: "src/main.tsx",
          cursor: { anchor: 100, head: -10 },
        },
      ],
      "self",
      "src/main.tsx",
      12,
    ),
  ).toEqual([
    {
      userId: "jun",
      displayName: "Jun",
      color: "#7389b7",
      from: 0,
      to: 12,
      head: 0,
    },
  ]);
});

test("falls back to the accent color for malformed remote colors", () => {
  const [selection] = getRemoteSelections(
    [
      {
        userId: "jun",
        displayName: "<Jun>",
        color: "not-a-color",
        selectedPath: "src/main.tsx",
        cursor: { anchor: 0, head: 0 },
      },
    ],
    "self",
    "src/main.tsx",
    1,
  );

  expect(selection.color).toBe("var(--accent)");
  expect(selection.displayName).toBe("<Jun>");
});
