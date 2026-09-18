import { afterEach, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";

import { getFileByPath } from "@iris/shared";
import { RoomClient, type RoomSocket } from "../../web/src/lib/room-client";
import { createRoomDatabase } from "./db/database";
import { createRoomApp } from "./room-app";
import { RoomRepository } from "./rooms/room-repository";
import { RoomService } from "./rooms/room-service";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});

function setup() {
  const { db, sqlite } = createRoomDatabase(":memory:");
  const rooms = new RoomService(new RoomRepository(db));
  const app = createRoomApp(rooms).listen({ port: 0, hostname: "127.0.0.1" });
  const clients: RoomClient[] = [];
  cleanup.push(async () => {
    for (const client of clients) client.disconnect();
    await app.stop(true);
    rooms.shutdown();
    sqlite.close();
  });
  function connect(userId: string, dropFirstAck = false) {
    const client = new RoomClient({
      roomId: "reconnect",
      identity: { userId, displayName: userId, color: "#d88961" },
      socketFactory: () => {
        const socket = new WebSocket(`ws://127.0.0.1:${app.server!.port}/ws/reconnect`);
        socket.addEventListener("message", (event) => {
          if (
            dropFirstAck &&
            typeof event.data === "string" &&
            event.data.includes('"update:ack"')
          ) {
            dropFirstAck = false;
            event.stopImmediatePropagation();
            socket.close();
          }
        });
        return socket as unknown as RoomSocket;
      },
    });
    clients.push(client);
    client.connect();
    return client;
  }
  return { connect, rooms };
}

async function waitFor(assertion: () => boolean) {
  for (let attempt = 0; attempt < 800; attempt++) {
    if (assertion()) return;
    await Bun.sleep(5);
  }
  expect(assertion()).toBe(true);
}

test("replays more than one rate window of offline edits without losing changes", async () => {
  const { connect, rooms } = setup();
  const client = connect("writer");
  const peer = connect("reader");
  await waitFor(() => Boolean(getFileByPath(peer.doc, "src/App.tsx")));
  await waitFor(() => Boolean(getFileByPath(client.doc, "src/App.tsx")));
  client.disconnect();
  const file = getFileByPath(client.doc, "src/App.tsx")!;
  for (let i = 0; i < 150; i++) {
    file.text.insert(0, "x");
    client.doc.commit();
  }
  client.connect();
  const expected = file.text.toString();
  await waitFor(
    () =>
      getFileByPath(rooms.getDocument("reconnect")!, "src/App.tsx")?.text.toString() === expected,
  );
  await waitFor(() => getFileByPath(peer.doc, "src/App.tsx")?.text.toString() === expected);
  file.text.insert(0, "after-reconnect");
  client.doc.commit();
  await waitFor(
    () => getFileByPath(peer.doc, "src/App.tsx")?.text.toString() === file.text.toString(),
  );
  expect(client.status).toBe("live");
}, 10_000);

test("reconnects after a lost acknowledgement without dropping or duplicating edits", async () => {
  const { connect, rooms } = setup();
  const client = connect("writer", true);
  const peer = connect("reader");
  await waitFor(() => Boolean(getFileByPath(peer.doc, "src/App.tsx")));
  await waitFor(() => Boolean(getFileByPath(client.doc, "src/App.tsx")));
  const file = getFileByPath(client.doc, "src/App.tsx")!;
  file.text.insert(0, "first");
  client.doc.commit();
  file.text.insert(0, "second");
  client.doc.commit();
  await waitFor(() => client.status === "reconnecting");
  await waitFor(() => client.status === "live");
  const expected = file.text.toString();
  await waitFor(
    () =>
      getFileByPath(rooms.getDocument("reconnect")!, "src/App.tsx")?.text.toString() === expected,
  );
  await waitFor(() => getFileByPath(peer.doc, "src/App.tsx")?.text.toString() === expected);
  expect(client.status).toBe("live");
});

test("online editing and presence bursts share a safe transport budget", async () => {
  const { connect, rooms } = setup();
  const client = connect("writer");
  const peer = connect("reader");
  await waitFor(() => Boolean(getFileByPath(peer.doc, "src/App.tsx")));
  await waitFor(() => Boolean(getFileByPath(client.doc, "src/App.tsx")));
  const file = getFileByPath(client.doc, "src/App.tsx")!;
  for (let i = 0; i < 150; i++) {
    file.text.insert(0, "x");
    client.doc.commit();
    client.sendPresence("src/App.tsx", { anchor: i, head: i });
  }
  const expected = file.text.toString();
  await waitFor(
    () =>
      getFileByPath(rooms.getDocument("reconnect")!, "src/App.tsx")?.text.toString() === expected,
  );
  await waitFor(
    () => peer.members.find((member) => member.userId === "writer")?.cursor?.head === 149,
  );
  expect(client.status).toBe("live");
}, 10_000);

test("retains oversized local edits without repeatedly reconnecting or claiming they synced", async () => {
  const { connect, rooms } = setup();
  const client = connect("writer");
  await waitFor(() => Boolean(getFileByPath(client.doc, "src/App.tsx")));
  const file = getFileByPath(client.doc, "src/App.tsx")!;
  const before = file.text.toString();
  const content = randomBytes(1_200_000).toString("base64");
  file.text.insert(0, content);
  client.doc.commit();
  await waitFor(() => client.status === "offline");
  expect(client.syncError).toContain("1 MiB");
  client.connect();
  expect(client.status).toBe("offline");
  file.text.insert(0, "retained locally");
  client.doc.commit();
  expect(file.text.toString()).toBe(`retained locally${content}${before}`);
  expect(getFileByPath(rooms.getDocument("reconnect")!, "src/App.tsx")!.text.toString()).toBe(
    before,
  );
}, 10_000);
