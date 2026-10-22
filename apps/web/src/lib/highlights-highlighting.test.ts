import { expect, test } from "bun:test";

import { formatHighlightsTokenStyle } from "./highlights-highlighting";

test("keeps the Highlights token color and supported font styles", () => {
  expect(formatHighlightsTokenStyle("#7DCFFF", 0)).toBe("color:#7DCFFF");
  expect(formatHighlightsTokenStyle("#7DCFFF", 3)).toBe(
    "color:#7DCFFF;font-style:italic;font-weight:700",
  );
});
