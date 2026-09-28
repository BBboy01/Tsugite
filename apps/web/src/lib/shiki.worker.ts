import { ShikiTokenCache } from "./shiki-engine";
import type { HighlightRequest, HighlightReply } from "./shiki-worker-client";

const cache = new ShikiTokenCache();
self.onmessage = async ({ data }: MessageEvent<HighlightRequest>) => {
  let spans: HighlightReply["spans"] = [];
  try {
    spans = await cache.highlight(data);
  } catch {
    // CodeMirror's native syntax highlighting remains available on failure.
  }
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- This is a dedicated worker, not a Window.
  self.postMessage({ id: data.id, spans } satisfies HighlightReply);
};
