import { expect, test } from "bun:test";

import { PROJECT_VERSION } from "./index";

test("shared package exports a project version", () => {
  expect(PROJECT_VERSION).toBe("1");
});
