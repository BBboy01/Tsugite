import { expect, test } from "bun:test";

import { createHighlightsSession } from "./highlights-engine";

test("tokenizes only the requested viewport while preserving multiline context", async () => {
  const source = '/* heading\nconst insideComment = 1;\n*/\nconst outside = "text";';
  const session = await createHighlightsSession(source, "typescript", "paper", [1, 3]);

  try {
    const spans = session.highlight([1, 3], [11, 36]);
    expect(spans.length).toBeGreaterThan(0);
    expect(spans.every((span) => span.from >= 11 && span.to <= 39)).toBe(true);
    expect(spans.map((span) => source.slice(span.from, span.to)).join("")).toContain(
      "const insideComment = 1;",
    );
    expect(spans[0]?.color).toBe("#a0ada0");
  } finally {
    session.dispose();
  }
});

test("applies UTF-16 line edits incrementally and returns updated absolute spans", async () => {
  const session = await createHighlightsSession(
    "const value = 1;\nconst other = 2;",
    "typescript",
    "paper",
    [0, 1],
  );

  try {
    const spans = session.applyEdits(
      [
        {
          range: {
            start: { line: 0, character: 14 },
            end: { line: 0, character: 15 },
          },
          newText: "2",
        },
      ],
      [0, 1],
      [0],
    );
    expect(spans.some((span) => span.from === 14 && span.to === 15)).toBe(true);
    expect(
      spans.map((span) => session.getLineText(0).slice(span.from, span.to)).join(""),
    ).toContain("2");
  } finally {
    session.dispose();
  }
});

test("re-highlights a scrolled viewport without changing the tokenizer document", async () => {
  const source = "const first = 1;\nconst second = 2;";
  const session = await createHighlightsSession(source, "typescript", "paper", [0, 1]);

  try {
    const spans = session.highlight([1, 2], [17]);
    expect(spans[0]?.from).toBe(17);
    expect(session.getText()).toBe(source);
  } finally {
    session.dispose();
  }
});
