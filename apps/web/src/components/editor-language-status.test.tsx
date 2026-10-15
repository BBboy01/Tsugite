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

test("disabled language services are visible even when project declarations are ready", async () => {
  await i18n.changeLanguage("en");
  const owner = new RoomTypeScriptIntelligence(
    { doc: createProjectDoc() },
    {
      createIntelligence: (files) => new TypeScriptWorkerClient(files, { createWorker }),
    },
  );
  await owner.clearDeclarations();
  await owner.intelligence.updateFile({ path: "huge.ts", text: "x".repeat(1024 * 1024 + 1) });
  expect(renderToStaticMarkup(<EditorLanguageStatus declarations={owner} />)).toContain(
    "Language services unavailable",
  );
  owner.dispose();
});

test("project declaration failure exposes the reason without removing editing", async () => {
  await i18n.changeLanguage("en");
  const owner = new RoomTypeScriptIntelligence(
    { doc: createProjectDoc() },
    { createIntelligence: (files) => new TypeScriptWorkerClient(files, { createWorker }) },
  );
  await owner.loadDeclarations(async () => {
    throw new Error("Types not installed");
  });
  expect(renderToStaticMarkup(<EditorLanguageStatus declarations={owner} />)).toContain(
    "Project types unavailable",
  );
  expect(renderToStaticMarkup(<EditorLanguageStatus declarations={owner} />)).toContain(
    "Types not installed",
  );
  owner.dispose();
});
