import { createTypeScriptIntelligence } from "./typescript-intelligence";
import { TypeScriptWorkerSession } from "./typescript-worker-session";
import type { WorkerRequest } from "./typescript-worker-protocol";
const session = new TypeScriptWorkerSession((files) => {
  const first = files.find(
    (file) => !file.path.startsWith("node_modules/") && /\.[cm]?[jt]sx?$/.test(file.path),
  ) ?? { path: "empty.ts", text: "" };
  return createTypeScriptIntelligence(first.path, first.text, files);
});
self.onmessage = ({ data }: MessageEvent<WorkerRequest>) => {
  void session.enqueue(data).then((reply) => {
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- Dedicated Worker transport.
    self.postMessage(reply);
  });
};
