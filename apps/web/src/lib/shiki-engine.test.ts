import { expect, test } from "bun:test";
import { highlightShikiTokens, ShikiTokenCache } from "./shiki-engine";

test("viewport tokens retain document offsets and multiline grammar context", async () => {
  const cache = new ShikiTokenCache();
  const source = '/* heading\nconst insideComment = 1;\n*/\nconst outside = "text";';
  const request = {
    source,
    language: "typescript",
    theme: "vitesse-light",
    from: 11,
    to: 35,
  } as const;
  const spans = await cache.highlight(request);
  expect(spans.length).toBeGreaterThan(0);
  expect(spans.every((span) => span.from < 35 && span.to > 11)).toBe(true);
  expect(spans.map((span) => source.slice(span.from, span.to)).join("")).toBe(
    "const insideComment = 1;",
  );
  const all = await highlightShikiTokens(source, "typescript", "vitesse-light");
  expect(spans[0].color).toBe(all.tokens[0][0].color!);
  expect(spans[0].color).not.toBe(all.tokens[3][0].color!);
});

test("scrolling to another viewport returns its tokens, and source or theme changes refresh colors", async () => {
  const cache = new ShikiTokenCache();
  const input = {
    source: "const a = 1;\nconst b = 2;",
    language: "typescript",
    theme: "vitesse-light",
    from: 0,
    to: 12,
  } as const;
  const first = await cache.highlight(input);
  const second = await cache.highlight({ ...input, from: 13, to: 25 });
  expect(first[0].from).toBe(0);
  expect(second[0].from).toBe(13);
  const dark = await cache.highlight({ ...input, theme: "dracula" });
  expect(dark[0].color).not.toBe(first[0].color);
  expect(await cache.highlight({ ...input, source: "" })).toEqual([]);
  const changed = await cache.highlight({ ...input, source: "// comment" });
  expect(changed).toHaveLength(1);
  expect(changed[0].to).toBe(10);
  expect(changed[0].color).not.toBe(first[0].color);
});

test("visible ranges may intersect a token without clipping its style span", async () => {
  const cache = new ShikiTokenCache();
  const spans = await cache.highlight({
    source: "const value = 1;",
    language: "typescript",
    theme: "vitesse-light",
    from: 2,
    to: 3,
  });
  expect(spans).toHaveLength(1);
  expect(spans[0]).toMatchObject({ from: 0, to: 6 });
});
