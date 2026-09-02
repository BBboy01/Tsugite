import { expect, test } from "bun:test";

import { formatShikiTokenStyle } from "./shiki-highlighting";

test("keeps the original Shiki token color", () => {
  expect(formatShikiTokenStyle("#7DCFFF", 0)).toBe("color:#7DCFFF");
});
