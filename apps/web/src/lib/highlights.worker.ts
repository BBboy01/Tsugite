import { createHighlightsSession, type HighlightsTokenizerSession } from "./highlights-engine";
import type { HighlightsReply, HighlightsRequest } from "./highlights-worker-client";

let session: HighlightsTokenizerSession | undefined;

self.onmessage = async ({ data }: MessageEvent<HighlightsRequest>) => {
  let spans: HighlightsReply["spans"] = [];
  try {
    if (data.reset || !session) {
      session?.dispose();
      session = await createHighlightsSession(
        data.source ?? "",
        data.language,
        data.theme,
        data.viewport,
      );
      spans = session.highlight(data.viewport, data.lineOffsets);
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
