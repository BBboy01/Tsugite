import { expect, test } from "bun:test";
import { RoomClient, type RoomSocket } from "./room-client";

function setup() {
  const socket: RoomSocket = {
    binaryType: "",
    readyState: 1,
    send: () => {},
    close: () => {},
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
  };
  const client = new RoomClient({
    roomId: "pending",
    identity: { userId: "one", displayName: "Maya", color: "#7389b7" },
    socketFactory: () => socket,
  });
  const states: boolean[] = [];
  client.subscribe((event) => {
    if (event.type === "sync") states.push(event.pending);
  });
  const edit = () => {
    client.doc.getText("text").insert(0, "pending");
    client.doc.commit();
  };
  const ack = () => socket.onmessage?.({ data: '{"type":"update:ack"}' });
  return { client, socket, states, edit, ack };
}

test("pending edits remain pending until all acknowledgements, including across reconnect", () => {
  const { client, socket, states, edit, ack } = setup();
  expect(client.hasPendingChanges).toBe(false);
  edit();
  edit();
  expect(client.hasPendingChanges).toBe(true);
  expect(states).toEqual([true]);
  client.connect();
  socket.onopen?.();
  ack();
  expect(client.hasPendingChanges).toBe(true);
  client.disconnect();
  expect(client.hasPendingChanges).toBe(true);
  client.connect();
  socket.onopen?.();
  ack();
  expect(client.hasPendingChanges).toBe(false);
  expect(states).toEqual([true, false]);
  ack();
  expect(states).toEqual([true, false]);
  client.disconnect();
});

test("presence traffic and remote imports do not mark this client as unsynced", () => {
  const { client, socket, states } = setup();
  const remote = setup().client;
  remote.doc.getText("text").insert(0, "remote");
  remote.doc.commit();
  client.connect();
  socket.onopen?.();
  client.sendPresence("src/App.tsx", { anchor: 0, head: 0 });
  socket.onmessage?.({ data: remote.doc.export({ mode: "snapshot" }) });
  expect(client.hasPendingChanges).toBe(false);
  expect(states).toEqual([]);
  client.disconnect();
});

test("an oversized edit retains its unsynced warning when synchronization stops", () => {
  const { client } = setup();
  client.doc.getText("text").insert(0, "x".repeat(1_100_000));
  client.doc.commit();
  expect(client.syncError).toBeDefined();
  expect(client.status).toBe("offline");
  expect(client.hasPendingChanges).toBe(true);
});
