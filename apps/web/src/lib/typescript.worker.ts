import { createTypeScriptIntelligence } from "./typescript-intelligence";
import { TypeScriptWorkerSession } from "./typescript-worker-session";
import type { WorkerRequest } from "./typescript-worker-protocol";
import { loadTypeScriptStandardLibrary } from "./typescript-standard-library";

const assets = import.meta.glob<string>(
  "../../../../node_modules/typescript-legacy/lib/lib.*.d.ts",
  {
    query: "?raw",
    import: "default",
  },
);
const libraries = loadTypeScriptStandardLibrary((name) => {
  const load = assets[`../../../../node_modules/typescript-legacy/lib/${name}`];
  return load ? load() : Promise.reject(new Error(`Missing TypeScript standard library: ${name}`));
});
const session = new TypeScriptWorkerSession(async (files) => {
  const first = files.find(
    (file) => !file.path.startsWith("node_modules/") && /\.[cm]?[jt]sx?$/.test(file.path),
  ) ?? { path: "empty.ts", text: "" };
  return createTypeScriptIntelligence(first.path, first.text, files, await libraries);
});
self.onmessage = ({ data }: MessageEvent<WorkerRequest>) => {
  void session.enqueue(data).then((reply) => {
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- Dedicated Worker transport.
    self.postMessage(reply);
  });
};
