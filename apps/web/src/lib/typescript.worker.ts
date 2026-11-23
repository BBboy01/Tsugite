import { createTypeScriptIntelligence } from "./typescript-intelligence";
import { TypeScriptWorkerSession } from "./typescript-worker-session";
import type { WorkerRequest } from "./typescript-worker-protocol";
import { loadTypeScriptStandardLibrary } from "./typescript-standard-library";

const assets = new Map(
  Object.entries(
    import.meta.glob<string>("@typescript-lib/lib.*.d.ts", {
      query: "?raw",
      import: "default",
    }),
  ).map(([path, load]) => [path.slice(path.lastIndexOf("/") + 1), load]),
);
const libraries = loadTypeScriptStandardLibrary((name) => {
  const load = assets.get(name);
  return load
    ? load()
    : Promise.reject(new Error(`Missing TypeScript standard library: ${name}`));
});
const session = new TypeScriptWorkerSession(async (files) => {
  const first = files.find(
    (file) =>
      !file.path.startsWith("node_modules/") &&
      /\.[cm]?[jt]sx?$/.test(file.path),
  ) ?? { path: "empty.ts", text: "" };
  return createTypeScriptIntelligence(
    first.path,
    first.text,
    files,
    await libraries,
  );
});
self.onmessage = ({ data }: MessageEvent<WorkerRequest>) => {
  void session.enqueue(data).then((reply) => {
    self.postMessage(reply);
  });
};
