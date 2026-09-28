import { expect, test } from "bun:test";
import { LoroDoc } from "loro-crdt";
import { RoomClient, type RoomSocket } from "./room-client";

function setup() {
  const sockets: RoomSocket[] = [];
  const sent: Array<Array<string | Uint8Array>> = [];
  const client = new RoomClient({
    roomId: "import-recovery",
    identity: { userId: "one", displayName: "Maya", color: "#7389b7" },
    url: "ws://room/import-recovery",
    socketFactory: () => {
      const messages: Array<string | Uint8Array> = [];
      const socket: RoomSocket = {
        binaryType: "",
        readyState: 1,
        send: (data) => messages.push(data),
        close: () => {
          socket.readyState = 3;
          socket.onclose?.();
        },
        onopen: null,
        onmessage: null,
        onclose: null,
        onerror: null,
      };
      sockets.push(socket);
      sent.push(messages);
      return socket;
    },
  });
  const remote = new LoroDoc();
  remote.getText("remote").insert(0, "server content");
  const snapshot = remote.export({ mode: "snapshot" });
  remote.free();
  client.connect();
  sockets[0]!.onopen?.();
  return { client, sockets, sent, snapshot };
}

for (const initiallyLive of [false, true]) {
  test(`recovers an invalid ${initiallyLive ? "update" : "initial snapshot"} without losing pending edits`, async () => {
    const { client, sockets, sent, snapshot } = setup();
    try {
      if (initiallyLive) sockets[0]!.onmessage?.({ data: snapshot });
      const document = client.doc;
      document.getText("local").insert(0, "unsynced");
      document.commit();
      const pending = [...client.pendingUpdates];
      const states: Array<{ status: string; error: string | undefined }> = [];
      client.subscribeStatus(() => states.push({ status: client.status, error: client.syncError }));

      expect(() => sockets[0]!.onmessage?.({ data: new Uint8Array([1, 2, 3]) })).not.toThrow();
      expect(client.status).toBe("reconnecting");
      expect(client.syncError).toBeDefined();
      expect(client.hasReceivedSnapshot).toBe(initiallyLive);
      expect(sockets[0]!.readyState).toBe(3);
      expect(sockets).toHaveLength(1);
      const error = client.syncError;
      expect(states.at(-1)).toEqual({ status: "reconnecting", error });

      sockets[0]!.onmessage?.({ data: '{"type":"update:ack"}' });
      expect(client.pendingUpdates).toEqual(pending);
      await new Promise((resolve) => setTimeout(resolve, 550));
      expect(sockets).toHaveLength(2);
      sockets[1]!.onopen?.();
      expect(client.status).toBe("reconnecting");
      expect(client.syncError).toBe(error);
      expect(sent[1]!.filter((message) => message instanceof Uint8Array)).toEqual(pending);
      sockets[0]!.onmessage?.({ data: '{"type":"update:ack"}' });
      expect(client.pendingUpdates).toEqual(pending);

      sockets[1]!.onmessage?.({ data: snapshot });
      expect(client.status).toBe("live");
      expect(client.syncError).toBeUndefined();
      expect(states.at(-1)).toEqual({ status: "live", error: undefined });
      expect(client.doc).toBe(document);
      expect(document.getText("local").toString()).toBe("unsynced");
      expect(document.getText("remote").toString()).toBe("server content");
      sockets[1]!.onmessage?.({ data: '{"type":"update:ack"}' });
      expect(client.hasPendingChanges).toBe(false);
    } finally {
      client.disconnect();
    }
  });
}

test("manual disconnect cancels import recovery without dropping local edits", async () => {
  const { client, sockets } = setup();
  try {
    client.doc.getText("local").insert(0, "kept");
    client.doc.commit();
    expect(() => sockets[0]!.onmessage?.({ data: new Uint8Array([1, 2, 3]) })).not.toThrow();
    client.doc.getText("local").insert(4, " while reconnecting");
    client.doc.commit();
    client.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 550));
    expect(sockets).toHaveLength(1);
    expect(client.status).toBe("offline");
    expect(client.hasPendingChanges).toBe(true);
    expect(client.pendingUpdates).toHaveLength(2);
    expect(client.doc.getText("local").toString()).toBe("kept while reconnecting");
  } finally {
    client.disconnect();
  }
});

test("an oversized edit during import recovery stops retries and keeps both edits local", async () => {
  const { client, sockets } = setup();
  try {
    client.doc.getText("local").insert(0, "kept");
    client.doc.commit();
    sockets[0]!.onmessage?.({ data: new Uint8Array([1, 2, 3]) });
    const recoverableError = client.syncError;
    client.doc.getText("large").insert(0, "x".repeat(1_100_000));
    client.doc.commit();
    expect(client.status).toBe("offline");
    expect(client.syncError).toBeDefined();
    expect(client.syncError).not.toBe(recoverableError);
    client.connect();
    await new Promise((resolve) => setTimeout(resolve, 550));
    expect(sockets).toHaveLength(1);
    expect(client.pendingUpdates).toHaveLength(2);
    expect(client.doc.getText("local").toString()).toBe("kept");
    expect(client.doc.getText("large").length).toBe(1_100_000);
  } finally {
    client.disconnect();
  }
});
