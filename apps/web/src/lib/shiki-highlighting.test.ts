import { expect, test } from "bun:test";

import { formatShikiTokenStyle, highlightShikiTokens } from "./shiki-highlighting";

test("keeps the original Shiki token color", () => {
  expect(formatShikiTokenStyle("#7DCFFF", 0)).toBe("color:#7DCFFF");
});

test("loads tokenization for the editor language and theme", async () => {
  const result = await highlightShikiTokens("const count = 2", "typescript", "vitesse-light");

  expect(result.tokens.flat().some((token) => token.content.trim() === "const")).toBe(true);
});
