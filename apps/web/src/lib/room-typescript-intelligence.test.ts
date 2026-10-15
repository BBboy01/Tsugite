import { expect, spyOn, test } from "bun:test";
import { createFile, createProjectDoc, deleteFile, getFileByPath, renameFile } from "@iris/shared";
import { RoomTypeScriptIntelligence } from "./room-typescript-intelligence";
import { TypeScriptWorkerSession } from "./typescript-worker-session";
import { createTypeScriptIntelligence } from "./typescript-intelligence";
import { standardLibraries } from "./typescript-test-libraries";
import { TypeScriptWorkerClient } from "./typescript-worker-client";
import type { IntelligenceWorker } from "./typescript-worker-client";
import { LoroDoc } from "loro-crdt";
import { transport } from "./typescript-worker-test-helpers";

test("language ownership does not create containers in an empty room", () => {
  const doc = new LoroDoc();
  const owner = new RoomTypeScriptIntelligence({ doc });
  expect(doc.toJSON()).toEqual({});
  owner.prepareDeclarations();
  expect(doc.toJSON()).toEqual({});
  owner.dispose();
});

test("room owner defers its default worker until language services are needed", () => {
  const doc = createProjectDoc();
  const owner = new RoomTypeScriptIntelligence({ doc });
  expect(owner.intelligence).toBeInstanceOf(TypeScriptWorkerClient);
  expect((owner.intelligence as TypeScriptWorkerClient).getMetricsSnapshot()).toMatchObject({
    workerStarts: 0,
  });
  owner.dispose();
});

test("rejected Loro edits recover only with the current complete source snapshot", async () => {
  const doc = createProjectDoc();
  createFile(doc, "src/large.ts", "typescript", "const large = true;");
  doc.commit();
  const workers: ReturnType<typeof transport>[] = [];
  const owner = new RoomTypeScriptIntelligence(
    { doc },
    {
      createIntelligence: (files) =>
        new TypeScriptWorkerClient(files, {
          createWorker: () => {
            const fake = transport();
            workers.push(fake);
            return fake.worker;
          },
        }),
    },
  );
  workers[0].reply(workers[0].sent[0], { status: "ok", value: null });
  const fullSnapshotReads = spyOn(doc, "getByPath");
  const countFullSnapshotReads = () =>
    fullSnapshotReads.mock.calls.filter(([path]) => path === "files").length;
  const large = getFileByPath(doc, "src/large.ts")!.text;
  large.insert(large.length, "x".repeat(1024 * 1024 + 1));
  doc.commit();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const oversizedStatus = owner.getServiceStatus().state;
  const readsAfterRejection = countFullSnapshotReads();
  const app = getFileByPath(doc, "src/App.tsx")!.text;
  app.insert(0, "// latest Loro edit\n");
  doc.commit();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const otherEditStatus = owner.getServiceStatus().state;
  const readsAfterUnavailableEdit = countFullSnapshotReads();
  const startsWhileRejected = workers.length;
  large.delete(0, large.length);
  large.insert(0, "const repaired = true;");
  doc.commit();
  const repaired = getFileByPath(doc, "src/large.ts")!.text;
  repaired.delete(repaired.length - 1, 1);
  doc.commit();
  const readsBeforeRecovery = countFullSnapshotReads();
  await new Promise((resolve) => setTimeout(resolve, 150));
  const recoveredWorker = workers[1];
  const initialization = recoveredWorker?.sent[0];
  if (initialization) recoveredWorker.reply(initialization, { status: "ok", value: null });
  const recoveredStatus = owner.getServiceStatus().state;
  owner.dispose();
  expect(oversizedStatus).toBe("unavailable");
  expect(otherEditStatus).toBe("unavailable");
  expect(readsAfterUnavailableEdit).toBe(readsAfterRejection);
  expect(readsBeforeRecovery).toBe(readsAfterRejection);
  expect(countFullSnapshotReads()).toBe(readsAfterRejection + 1);
  expect(startsWhileRejected).toBe(1);
  expect(workers).toHaveLength(2);
  expect(initialization).toMatchObject({
    kind: "initialize",
    files: expect.arrayContaining([
      expect.objectContaining({ path: "src/App.tsx", text: app.toString() }),
      expect.objectContaining({ path: "src/large.ts", text: large.toString() }),
    ]),
  });
  expect(recoveredStatus).toBe("ready");
});

function createOwner() {
  const doc = createProjectDoc();
  const session = new TypeScriptWorkerSession((files) => {
    const first = files.find((file) => file.path === "src/App.tsx")!;
    return createTypeScriptIntelligence(first.path, first.text, files, standardLibraries);
  });
  const worker: IntelligenceWorker = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage(request) {
      void session.enqueue(request).then((data) => worker.onmessage?.({ data } as MessageEvent));
    },
    terminate: () => session.dispose(),
  };
  const owner = new RoomTypeScriptIntelligence(
    { doc },
    {
      createIntelligence: (files) =>
        new TypeScriptWorkerClient(files, { createWorker: () => worker }),
    },
  );
  return { doc, owner };
}

function typedPackageDeclarations(entry: string) {
  return [
    { path: "node_modules/typed-pkg/package.json", text: JSON.stringify({ types: entry }) },
    { path: "node_modules/typed-pkg/first.d.ts", text: "export declare const value: 1;" },
    { path: "node_modules/typed-pkg/second.d.ts", text: "export declare const value: 2;" },
  ];
}

test("room owner publishes Loro edits, creates, renames and deletes to one intelligence instance", async () => {
  const { doc, owner } = createOwner();
  const engine = owner.intelligence;
  const query = () => engine.hover({ path: "src/App.tsx", position: 0 });
  const revision = owner.currentSnapshotRevision;
  const file = getFileByPath(doc, "src/App.tsx")!;
  file.text.insert(0, "// remote edit\n");
  doc.commit();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(owner.currentSnapshotRevision).toBeGreaterThan(revision);
  expect(owner.intelligence).toBe(engine);
  createFile(doc, "src/new.ts", "typescript", "export const created = true;");
  doc.commit();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(await engine.hover({ path: "src/new.ts", position: 13 })).toMatchObject({ status: "ok" });
  renameFile(doc, getFileByPath(doc, "src/new.ts")!.id, "src/renamed.ts");
  doc.commit();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(await engine.hover({ path: "src/new.ts", position: 13 })).toEqual({ status: "empty" });
  deleteFile(doc, getFileByPath(doc, "src/renamed.ts")!.id);
  doc.commit();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(await engine.hover({ path: "src/renamed.ts", position: 0 })).toEqual({ status: "empty" });
  owner.dispose();
  expect(await query()).toEqual({ status: "disposed" });
});

test("third-party declarations resolve in the worker and failed reads remove stale types", async () => {
  const { doc, owner } = createOwner();
  const source = getFileByPath(doc, "src/App.tsx")!.text;
  source.delete(0, source.length);
  source.insert(0, 'import { value } from "typed-pkg"; value;');
  doc.commit();
  await owner.loadDeclarations(async () => [
    { path: "node_modules/typed-pkg/package.json", text: '{"types":"index.d.ts"}' },
    { path: "node_modules/typed-pkg/index.d.ts", text: 'export declare const value: "typed";' },
  ]);
  expect(owner.getDeclarationsStatus()).toEqual({ status: "ready" });
  expect(await owner.intelligence.hover({ path: "src/App.tsx", position: 35 })).toMatchObject({
    status: "ok",
    value: { signature: '(alias) const value: "typed"\nimport value' },
  });
  await owner.loadDeclarations(async () => {
    throw new Error("Dependency installation incomplete");
  });
  expect(owner.getDeclarationsSnapshot()).toEqual([]);
  expect(owner.getDeclarationsStatus()).toEqual({
    status: "unavailable",
    reason: "Dependency installation incomplete",
  });
  expect(await owner.intelligence.hover({ path: "src/App.tsx", position: 35 })).not.toMatchObject({
    value: { signature: '(alias) const value: "typed"\nimport value' },
  });
  owner.dispose();
});

test("room declaration rescans invalidate cached package type entrypoints", async () => {
  const { doc, owner } = createOwner();
  const source = 'import { value } from "typed-pkg"; value;';
  const app = getFileByPath(doc, "src/App.tsx")!.text;
  app.delete(0, app.length);
  app.insert(0, source);
  doc.commit();
  const hover = () =>
    owner.intelligence.hover({ path: "src/App.tsx", position: source.length - 1 });
  try {
    await owner.loadDeclarations(async () => typedPackageDeclarations("first.d.ts"));
    expect(await hover()).toMatchObject({
      status: "ok",
      value: { signature: "(alias) const value: 1\nimport value" },
    });
    await owner.loadDeclarations(async () => typedPackageDeclarations("second.d.ts"));
    expect(await hover()).toMatchObject({
      status: "ok",
      value: { signature: "(alias) const value: 2\nimport value" },
    });
  } finally {
    owner.dispose();
  }
});

test("new scans and disposal discard late declaration results", async () => {
  const { owner } = createOwner();
  const old = Promise.withResolvers<{ path: string; text: string }[]>();
  const late = Promise.withResolvers<{ path: string; text: string }[]>();
  let notifications = 0;
  const stop = owner.subscribeDeclarations(() => notifications++);
  const pending = owner.loadDeclarations(() => old.promise);
  expect(owner.getDeclarationsStatus()).toEqual({ status: "loading" });
  await owner.syncDeclarations([{ path: "latest.d.ts", text: 'declare const latest: "new";' }]);
  old.resolve([{ path: "old.d.ts", text: 'declare const old: "stale";' }]);
  await pending;
  expect(owner.getDeclarationsSnapshot()).toEqual([
    { path: "latest.d.ts", text: 'declare const latest: "new";' },
  ]);
  const after = owner.loadDeclarations(() => late.promise);
  owner.dispose();
  const beforeCompletion = notifications;
  late.resolve([{ path: "late.d.ts", text: "export {};" }]);
  await after;
  expect(owner.getDeclarationsSnapshot()).toEqual([]);
  expect(notifications).toBe(beforeCompletion);
  stop();
});

test("invalid scans are rejected before disabling the source worker", async () => {
  const { owner } = createOwner();
  await owner.syncDeclarations([{ path: "../unsafe.d.ts", text: "export {};" }]);
  expect(owner.getDeclarationsStatus()).toEqual({
    status: "unavailable",
    reason: "Invalid TypeScript declaration path",
  });
  expect(owner.status).toBe("worker");
  expect(owner.getDeclarationsSnapshot()).toEqual([]);
  expect((await owner.intelligence.completion({ path: "src/App.tsx", position: 0 })).status).toBe(
    "ok",
  );
  owner.dispose();
});

test("a stale clear does not overwrite a later declaration loading status", async () => {
  const { owner } = createOwner();
  const pending = Promise.withResolvers<{ path: string; text: string }[]>();
  const clear = owner.clearDeclarations("old failure");
  const scan = owner.loadDeclarations(() => pending.promise);
  await clear;
  expect(owner.getDeclarationsStatus()).toEqual({ status: "loading" });
  pending.resolve([]);
  await scan;
  owner.dispose();
});
