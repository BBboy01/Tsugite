import { expect, test } from "bun:test";
import { createFile, createProjectDoc, getFileByPath } from "@iris/shared";
import { RoomSession } from "./room-session";
import type { RoomSocket } from "./room-transport";
import { TypeScriptWorkerClient } from "./typescript-worker-client";
import type { WorkerReply } from "./typescript-worker-protocol";
import { transport } from "./typescript-worker-test-helpers";

function createSession() {
  const workers: ReturnType<typeof transport>[] = [];
  const sockets: RoomSocket[] = [];
  const sent: (string | Uint8Array)[] = [];
  const session = new RoomSession({
    roomId: "session",
    identity: { userId: "one", displayName: "Maya", color: "#d88961" },
    socketFactory: () => {
      const socket: RoomSocket = {
        binaryType: "",
        readyState: 0,
        send(data) {
          sent.push(data);
        },
        close() {
          socket.readyState = 3;
          socket.onclose?.();
        },
        onopen: null,
        onmessage: null,
        onclose: null,
        onerror: null,
      };
      sockets.push(socket);
      return socket;
    },
    createEditorIntelligence: (files) =>
      new TypeScriptWorkerClient(files, {
        lazyStart: true,
        createWorker: () => {
          const worker = transport();
          workers.push(worker);
          return worker.worker;
        },
      }),
  });
  return { session, workers, sockets, sent };
}

const flushDisposal = () => new Promise((resolve) => setTimeout(resolve, 10));

test("an unmounted render cannot start a worker and mount publishes the latest source snapshot", async () => {
  const { session, workers } = createSession();
  const doc = createProjectDoc();
  session.client.doc.import(doc.export({ mode: "snapshot" }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(workers).toHaveLength(0);
  const unmount = session.mount(() => {});
  const query = session.typeScript.intelligence.hover({ path: "src/App.tsx", position: 0 });
  expect(workers[0].sent[0]).toMatchObject({
    kind: "initialize",
    files: expect.arrayContaining([expect.objectContaining({ path: "src/App.tsx" })]),
  });
  unmount();
  await flushDisposal();
  expect(await query).toEqual({ status: "disposed" });
});

test("StrictMode setup-cleanup-setup reuses the session and disposes only after the last cleanup", async () => {
  const { session, workers, sockets } = createSession();
  const first = session.mount(() => {});
  const request = session.typeScript.intelligence.hover({ path: "app.ts", position: 0 });
  expect(workers).toHaveLength(1);
  workers[0].reply(workers[0].sent[0], { status: "ok", value: null });
  workers[0].reply(workers[0].sent[1], { status: "empty" });
  await request;
  first();
  const second = session.mount(() => {});
  await flushDisposal();
  expect(sockets).toHaveLength(1);
  expect(workers[0].stopped()).toBe(0);
  expect(session.client.status).toBe("connecting");
  second();
  second();
  await flushDisposal();
  expect(session.client.status).toBe("offline");
  expect(session.typeScript.getServiceStatus()).toEqual({ state: "disposed" });
  expect(workers[0].stopped()).toBe(1);
});

test("session document subscriptions detach without disabling collaboration or replacing intelligence on reconnect", async () => {
  const { session, sockets } = createSession();
  const changes: unknown[] = [];
  const unmount = session.mount((change) => changes.push(change));
  const intelligence = session.typeScript.intelligence;
  const remote = createProjectDoc();
  sockets[0].readyState = 1;
  sockets[0].onopen?.();
  sockets[0].onmessage?.({ data: remote.export({ mode: "snapshot" }) });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(changes).toContainEqual({ workspace: true, settings: true, content: true });
  session.client.disconnect();
  session.client.connect();
  expect(sockets).toHaveLength(2);
  expect(session.typeScript.intelligence).toBe(intelligence);
  unmount();
  const notifications = changes.length;
  createFile(session.client.doc, "detached.ts", "typescript", "export {};");
  session.client.doc.commit();
  await flushDisposal();
  expect(changes).toHaveLength(notifications);
});

test("unmount disposes pending worker queries and ignores late declarations and document edits", async () => {
  const { session, workers } = createSession();
  const unmount = session.mount(() => {});
  const source = createProjectDoc();
  session.client.doc.import(source.export({ mode: "snapshot" }));
  const query = session.typeScript.intelligence.hover({ path: "src/App.tsx", position: 0 });
  workers[0].reply(workers[0].sent[0], { status: "ok", value: null });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const hover = workers[0].sent.find(
    (request) => request.kind === "query" && request.method === "hover",
  )!;
  expect(hover).toBeDefined();
  const deliver = workers[0].worker.onmessage!;
  const late = Promise.withResolvers<{ path: string; text: string }[]>();
  const scan = session.typeScript.loadDeclarations(() => late.promise);
  unmount();
  await flushDisposal();
  expect(await query).toEqual({ status: "disposed" });
  const messages = workers[0].sent.length;
  deliver({
    data: {
      epoch: hover.epoch,
      requestId: hover.requestId,
      workspaceVersion: hover.workspaceVersion,
      result: { status: "ok", value: { signature: "late" } },
    },
  } as MessageEvent<WorkerReply>);
  late.resolve([{ path: "node_modules/pkg/index.d.ts", text: "export {};" }]);
  await scan;
  const app = getFileByPath(session.client.doc, "src/App.tsx")!;
  app.text.insert(0, "// after unmount\n");
  session.client.doc.commit();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(session.typeScript.getDeclarationsSnapshot()).toEqual([]);
  expect(workers[0].sent).toHaveLength(messages);
  expect(workers[0].stopped()).toBe(1);
});

test("worker failure leaves room transport, pending edits and presence usable", async () => {
  const { session, sockets, workers, sent } = createSession();
  const unmount = session.mount(() => {});
  sockets[0].readyState = 1;
  sockets[0].onopen?.();
  const query = session.typeScript.intelligence.hover({ path: "app.ts", position: 0 });
  workers[0].crash();
  workers[1].crash();
  expect(await query).toEqual({ status: "error", message: "TypeScript worker failed" });
  expect(session.typeScript.getServiceStatus().state).toBe("unavailable");
  session.client.doc.getText("text").insert(0, "still collaborative");
  session.client.doc.commit();
  session.client.sendPresence("app.ts");
  expect(session.client.status).toBe("live");
  expect(session.client.hasPendingChanges).toBe(true);
  expect(sent.some((message) => message instanceof Uint8Array)).toBe(true);
  expect(sent.at(-1)).toContain('"selectedPath":"app.ts"');
  sockets[0].onmessage?.({ data: JSON.stringify({ type: "update:ack" }) });
  expect(session.client.hasPendingChanges).toBe(false);
  unmount();
  await flushDisposal();
});

test("a released session cannot reconnect or enqueue updates from a retained document", async () => {
  const { session, sockets } = createSession();
  const unmount = session.mount(() => {});
  unmount();
  await flushDisposal();
  session.client.doc.getText("text").insert(0, "retained by a late consumer");
  session.client.doc.commit();
  expect(session.client.hasPendingChanges).toBe(false);
  session.client.connect();
  expect(session.client.status).toBe("offline");
  expect(sockets).toHaveLength(1);
});
