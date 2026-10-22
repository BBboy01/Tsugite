import { createHighlightsSession, type HighlightsTokenizerSession } from "./highlights-engine";
import type { HighlightsReply, HighlightsRequest } from "./highlights-worker-client";

let session: HighlightsTokenizerSession | undefined;
let sessionLanguage: HighlightsRequest["language"] | undefined;
let sessionTheme: HighlightsRequest["theme"] | undefined;

self.onmessage = async ({ data }: MessageEvent<HighlightsRequest>) => {
  let spans: HighlightsReply["spans"] = [];
  try {
    if (
      data.reset ||
      !session ||
      sessionLanguage !== data.language ||
      sessionTheme !== data.theme
    ) {
      session?.dispose();
      session = await createHighlightsSession(
        data.source ?? "",
        data.language,
        data.theme,
        data.viewport,
      );
      sessionLanguage = data.language;
      sessionTheme = data.theme;
      spans = session.highlight(data.viewport, data.lineOffsets);
    } else if (data.source !== undefined && data.source !== session.getText()) {
      const previous = session.getText();
      const previousLines = previous.split(/\r\n|\r|\n/);
      session.pause();
      try {
        spans = session.applyEdits(
          [
            {
              range: {
                start: { line: 0, character: 0 },
                end: {
                  line: previousLines.length - 1,
                  character: previousLines.at(-1)?.length ?? 0,
                },
              },
              newText: data.source,
            },
          ],
          data.viewport,
          data.lineOffsets,
        );
      } finally {
        session.resume();
      }
    } else if (data.edits.length > 0) {
      spans = session.applyEdits(data.edits, data.viewport, data.lineOffsets);
    } else {
      spans = session.highlight(data.viewport, data.lineOffsets);
    }
  } catch {
    // CodeMirror's native syntax highlighting remains available on failure.
  }
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- This is a dedicated worker, not a Window.
  self.postMessage({ id: data.id, spans, ready: true } satisfies HighlightsReply);
};
