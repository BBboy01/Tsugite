import { expect, test } from "bun:test";
import { faker } from "@faker-js/faker";
import { LoroDoc } from "loro-crdt";

import { createGuestIdentity, RoomClient, type RoomSocket } from "./room-client";

class FakeSocket implements RoomSocket {
  binaryType = "";
  readyState = 0;
  sent: Array<string | Uint8Array> = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string | ArrayBuffer | Uint8Array }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  send(data: string | Uint8Array): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  message(data: string | Uint8Array): void {
    this.onmessage?.({ data });
  }
}

test("joins the room and imports a binary snapshot", () => {
  const socket = new FakeSocket();
  const client = new RoomClient({
    roomId: "demo",
    identity: { userId: "one", displayName: "Maya", color: "#d88961" },
    socketFactory: () => socket,
  });

  client.connect();
  socket.open();
  expect(socket.sent[0]).toContain('"type":"join"');

  const source = new LoroDoc();
  source.getText("text").insert(0, "snapshot");
  socket.message(source.export({ mode: "snapshot" }));

  expect(client.doc.getText("text").toString()).toBe("snapshot");
});

test("queues local updates while offline and flushes after reconnect", () => {
  const socket = new FakeSocket();
  const client = new RoomClient({
    roomId: "demo",
    identity: { userId: "one", displayName: "Maya", color: "#d88961" },
    socketFactory: () => socket,
  });

  client.doc.getText("text").insert(0, "queued");
  client.doc.commit();
  client.connect();
  socket.open();

  expect(socket.sent.some((message) => message instanceof Uint8Array)).toBe(true);
});

test("updates presence and status events", () => {
  const socket = new FakeSocket();
  const client = new RoomClient({
    roomId: "demo",
    identity: { userId: "one", displayName: "Maya", color: "#d88961" },
    socketFactory: () => socket,
  });
  const statuses: string[] = [];

  client.subscribe((event) => {
    if (event.type === "status") statuses.push(event.status);
  });
  client.connect();
  socket.open();
  client.sendPresence("src/main.ts", { anchor: 1, head: 1 });
  socket.close();

  expect(statuses).toContain("live");
  expect(statuses).toContain("reconnecting");
  expect(socket.sent.at(-1)).toContain('"selectedPath":"src/main.ts"');
  client.disconnect();
});

test("creates a guest identity without asking for a display name", () => {
  faker.seed(2026);
  const expectedName = faker.internet.username();
  faker.seed(2026);
  const identity = createGuestIdentity();

  expect(identity.displayName).toBe(expectedName);
  expect(identity.userId).toBeString();
  expect(identity.color).toMatch(/^#[0-9a-f]{6}$/);
});

test("renames the identity and broadcasts the updated presence", () => {
  const socket = new FakeSocket();
  const client = new RoomClient({
    roomId: "demo",
    identity: { userId: "one", displayName: "Guest 1234", color: "#d88961" },
    socketFactory: () => socket,
  });

  client.connect();
  socket.open();
  client.sendPresence("src/main.ts", { anchor: 1, head: 1 });

  expect(client.updateDisplayName("Maya")).toBe(true);
  expect(client.identity.displayName).toBe("Maya");
  expect(socket.sent.at(-1)).toContain('"displayName":"Maya"');
  expect(socket.sent.at(-1)).toContain('"selectedPath":"src/main.ts"');
});

test("changes the avatar color and broadcasts the updated presence", () => {
  const socket = new FakeSocket();
  const client = new RoomClient({
    roomId: "demo",
    identity: { userId: "one", displayName: "Maya", color: "#d88961" },
    socketFactory: () => socket,
  });

  client.connect();
  socket.open();

  expect(client.updateColor("#7389b7")).toBe(true);
  expect(client.identity.color).toBe("#7389b7");
  expect(socket.sent.at(-1)).toContain('"color":"#7389b7"');
});

test("accepts a custom avatar color", () => {
  const client = new RoomClient({
    roomId: "demo",
    identity: { userId: "one", displayName: "Maya", color: "#d88961" },
    socketFactory: () => new FakeSocket(),
  });

  expect(client.updateColor("#24a9a0")).toBe(true);
  expect(client.identity.color).toBe("#24a9a0");
});
