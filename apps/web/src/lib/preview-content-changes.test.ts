import { expect, test } from "bun:test";

import { PreviewContentChanges } from "./preview-content-changes";
import { projectFile } from "./webcontainer-test-utils";

test("acknowledging an older sync does not clear a newer edit", () => {
  const changes = new PreviewContentChanges();
  const file = projectFile("main.js", "first");
  changes.record(file);
  const firstSync = changes.pending();
  file.text = { toString: () => "second" } as typeof file.text;
  changes.record(file);

  changes.acknowledge(firstSync);

  expect(changes.pending()).toHaveLength(1);
  expect(changes.pending()[0]?.file.text.toString()).toBe("second");
});
