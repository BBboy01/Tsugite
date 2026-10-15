import { expect, spyOn, test } from "bun:test";
import { createFile, createProjectDoc, deleteFile, getFileByPath, renameFile } from "@iris/shared";
import { RoomTypeScriptIntelligence } from "./room-typescript-intelligence";
import { TypeScriptWorkerSession } from "./typescript-worker-session";
import { createTypeScriptIntelligence } from "./typescript-intelligence";
import { TypeScriptWorkerClient } from "./typescript-worker-client";
import type { IntelligenceWorker } from "./typescript-worker-client";
import { LoroDoc } from "loro-crdt";
import { transport } from "./typescript-worker-test-helpers";

test("language ownership does not create containers in an empty room", () => {
  const doc = new LoroDoc();
  const owner = new RoomTypeScriptIntelligence({ doc });
  expect(doc.toJSON()).toEqual({});
  owner.dispose();
});

test("room owner defers its default worker until language services are needed", () => {
  const doc = createProjectDoc();
  const owner = new RoomTypeScriptIntelligence({ doc });
  expect(owner.intelligence).toBeInstanceOf(TypeScriptWorkerClient);
  expect((owner.intelligence as TypeScriptWorkerClient).getMetricsSnapshot()).toMatchObject({
    workerStarts: 0,
    fallbackCount: 0,
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
    return createTypeScriptIntelligence(first.path, first.text, files);
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
