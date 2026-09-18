import { expect, test } from "bun:test";
import { LoroDoc } from "loro-crdt";

import {
  createProjectDoc,
  createFile,
  getFileByPath,
  renameFile,
  deleteFile,
  setSharedSetting,
} from "@iris/shared";

import { RoomClient, type RoomClientEvent, type RoomSocket } from "./room-client";

async function setup() {
  const sent: Array<string | Uint8Array> = [];
  const socket: RoomSocket = {
    binaryType: "",
    readyState: 1,
    send: (message) => {
      sent.push(message);
    },
    close() {},
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
  };
  const client = new RoomClient({
    roomId: "demo",
    identity: { userId: "one", displayName: "One", color: "#123456" },
    socketFactory: () => socket,
  });
  const events: Extract<RoomClientEvent, { type: "document" }>[] = [];
  client.subscribe((event) => {
    if (event.type === "document") events.push(event);
  });
  client.connect();
  socket.onopen!();
  socket.onmessage!({ data: createProjectDoc().export({ mode: "snapshot" }) });
  await Promise.resolve();
  return { client, socket, events, sent };
}

test("initial snapshot invalidates workspace and settings exactly once", async () => {
  const { events } = await setup();
  expect(events).toHaveLength(1);
  expect(events[0]?.changes).toEqual({ workspace: true, settings: true, content: true });
});

test("local text edits notify content without rebuilding workspace metadata", async () => {
  const { client, events, sent } = await setup();
  events.length = 0;
  const file = getFileByPath(client.doc, "src/App.tsx")!;
  file.text.insert(0, "// local edit\n");
  client.doc.commit();
  await Promise.resolve();
  expect(events).toEqual([
    { type: "document", changes: { workspace: false, settings: false, content: true } },
  ]);
  expect(sent.at(-1)).toBeInstanceOf(Uint8Array);
});

test("remote text edits and duplicate imports do not create structural invalidations", async () => {
  const { client, socket, events } = await setup();
  events.length = 0;
  const remote = new LoroDoc();
  remote.import(client.doc.export({ mode: "snapshot" }));
  const from = remote.version();
  getFileByPath(remote, "src/App.tsx")!.text.insert(0, "// remote edit\n");
  const bytes = remote.export({ mode: "update", from });
  socket.onmessage!({ data: bytes });
  await Promise.resolve();
  socket.onmessage!({ data: bytes });
  await Promise.resolve();
  expect(events).toEqual([
    { type: "document", changes: { workspace: false, settings: false, content: true } },
  ]);
  expect(getFileByPath(client.doc, "src/App.tsx")!.text.toString()).toStartWith("// remote edit");
});

test("settings changes do not invalidate file structure", async () => {
  const { client, events } = await setup();
  events.length = 0;
  setSharedSetting(client.doc, "theme", "nord");
  client.doc.commit();
  await Promise.resolve();
  expect(events).toEqual([
    { type: "document", changes: { workspace: false, settings: true, content: false } },
  ]);
});

test("mixed file creation and settings changes preserve both invalidations", async () => {
  const { client, events } = await setup();
  events.length = 0;
  createFile(client.doc, "src/new.ts", "typescript", "export const value = 1;");
  setSharedSetting(client.doc, "theme", "nord");
  client.doc.commit();
  await Promise.resolve();
  expect(events).toEqual([
    { type: "document", changes: { workspace: true, settings: true, content: true } },
  ]);
});

test("rename and delete invalidate workspace metadata", async () => {
  const { client, events } = await setup();
  const file = getFileByPath(client.doc, "src/App.tsx")!;
  events.length = 0;
  renameFile(client.doc, file.id, "src/Renamed.tsx");
  client.doc.commit();
  await Promise.resolve();
  expect(events.at(-1)?.changes.workspace).toBe(true);
  expect(events.at(-1)?.changes.settings).toBe(false);
  events.length = 0;
  deleteFile(client.doc, file.id);
  client.doc.commit();
  await Promise.resolve();
  expect(events.at(-1)?.changes.workspace).toBe(true);
});
