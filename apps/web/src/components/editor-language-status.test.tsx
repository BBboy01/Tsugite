import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { EditorLanguageStatus } from "./editor-language-status";
import { RoomTypeScriptIntelligence } from "../lib/room-typescript-intelligence";
import { createProjectDoc } from "@iris/shared";
import i18n from "../lib/i18n";
import { TypeScriptWorkerClient, type IntelligenceWorker } from "../lib/typescript-worker-client";

function createWorker(): IntelligenceWorker {
  const worker: IntelligenceWorker = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    terminate() {},
    postMessage(request) {
      queueMicrotask(() =>
        worker.onmessage?.({
          data: { ...request, result: { status: "ok", value: null } },
        } as MessageEvent),
      );
    },
  };
  return worker;
}

test("disabled language services expose the source budget failure", async () => {
  await i18n.changeLanguage("en");
  const owner = new RoomTypeScriptIntelligence(
    { doc: createProjectDoc() },
    {
      createIntelligence: (files) => new TypeScriptWorkerClient(files, { createWorker }),
    },
  );
  await owner.intelligence.updateFile({ path: "huge.ts", text: "x".repeat(1024 * 1024 + 1) });
  expect(renderToStaticMarkup(<EditorLanguageStatus serviceStatus={owner} />)).toContain(
    "Language services unavailable",
  );
  expect(renderToStaticMarkup(<EditorLanguageStatus serviceStatus={owner} />)).toContain(
    "TypeScript source file limit exceeded",
  );
  owner.dispose();
});

test("language status shows loading and clears after worker initialization", async () => {
  await i18n.changeLanguage("en");
  const worker = createWorker();
  const owner = new RoomTypeScriptIntelligence(
    { doc: createProjectDoc() },
    {
      createIntelligence: (files) =>
        new TypeScriptWorkerClient(files, { lazyStart: true, createWorker: () => worker }),
    },
  );
  expect(renderToStaticMarkup(<EditorLanguageStatus serviceStatus={owner} />)).toContain(
    "Loading language services",
  );
  await owner.intelligence.syncWorkspace([]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(renderToStaticMarkup(<EditorLanguageStatus serviceStatus={owner} />)).toBe("");
  owner.dispose();
});
