import { expect, test } from "bun:test";

import { clampEditorSelection } from "./editor-selection";

test("clamps remote selections to the current document", () => {
  expect(clampEditorSelection({ anchor: -4, head: 99 }, 12)).toEqual({ anchor: 0, head: 12 });
});
