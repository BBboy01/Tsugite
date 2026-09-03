import { expect, test } from "bun:test";
import { LoroDoc } from "loro-crdt";

import { readSettings, setSharedSetting } from "@iris/shared";

import { RoomService, type RoomSocket } from "./room-service";

function createSocket() {
  const messages: Array<string | Uint8Array> = [];
  const socket: RoomSocket = { send: (data) => messages.push(data) };
  return { socket, messages };
}

test("joins a room with a snapshot and presence list", () => {
  const service = new RoomService();
  const first = createSocket();

  expect(
    service.join(first.socket, "demo", {
      type: "join",
      userId: "one",
      displayName: "Maya",
      color: "#d88961",
    }),
  ).toBe(true);

  expect(first.messages).toHaveLength(3);
  expect(first.messages[0]).toBe(JSON.stringify({ type: "ready", roomId: "demo" }));
  expect(first.messages[1]).toBeInstanceOf(Uint8Array);
  expect(JSON.parse(String(first.messages[2]))).toEqual({
    type: "presence:list",
    members: [
      {
        userId: "one",
        displayName: "Maya",
        color: "#d88961",
        selectedPath: null,
        cursor: null,
      },
    ],
  });
});

test("imports updates and broadcasts them to other room members", () => {
  const service = new RoomService();
  const first = createSocket();
  const second = createSocket();

  service.join(first.socket, "demo", {
    type: "join",
    userId: "one",
    displayName: "Maya",
    color: "#d88961",
  });
  service.join(second.socket, "demo", {
    type: "join",
    userId: "two",
    displayName: "Jun",
    color: "#7389b7",
  });

  const updatesBefore = second.messages.length;
  const doc = service.getDocument("demo")!;
  const text = doc.getText("file:missing");
  text.insert(0, "relay");
  const update = doc.export({ mode: "update" });

  expect(service.update(first.socket, update)).toBe(true);
  expect(second.messages.length).toBeGreaterThan(updatesBefore);
  expect(second.messages.at(-1)).toBeInstanceOf(Uint8Array);
});

test("rejects invalid joins and removes presence on leave", () => {
  const service = new RoomService();
  const invalid = createSocket();
  const valid = createSocket();

  expect(
    service.join(valid.socket, "demo", {
      type: "join",
      userId: "one",
      displayName: "Maya",
      color: "#d88961",
    }),
  ).toBe(true);
  expect(
    service.join(invalid.socket, "demo", {
      type: "join",
      userId: "two",
      displayName: "",
      color: "not-a-color",
    }),
  ).toBe(false);

  expect(service.leave(valid.socket)).toBe(true);
  expect(service.memberCount("demo")).toBe(0);
});

test("keeps the room document when the last member reconnects", () => {
  const service = new RoomService();
  const first = createSocket();

  service.join(first.socket, "demo", {
    type: "join",
    userId: "one",
    displayName: "Maya",
    color: "#d88961",
  });

  const clientDoc = new LoroDoc();
  clientDoc.import(first.messages[1] as Uint8Array);
  setSharedSetting(clientDoc, "theme", "dracula");
  clientDoc.commit();
  expect(service.update(first.socket, clientDoc.export({ mode: "update" }))).toBe(true);
  expect(service.leave(first.socket)).toBe(true);

  const reconnected = createSocket();
  service.join(reconnected.socket, "demo", {
    type: "join",
    userId: "one",
    displayName: "Maya",
    color: "#d88961",
  });

  const restoredDoc = new LoroDoc();
  restoredDoc.import(reconnected.messages[1] as Uint8Array);
  expect(readSettings(restoredDoc).theme).toBe("dracula");
});
