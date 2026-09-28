import { expect, test } from "bun:test";
import { RoomTransport, type RoomSocket, type TransportEvent } from "./room-transport";

class FakeSocket implements RoomSocket {
  binaryType = "";
  readyState = 0;
  sent: Array<string | Uint8Array> = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string | ArrayBuffer | Uint8Array }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  open() {
    this.readyState = 1;
    this.onopen?.();
  }

  send(data: string | Uint8Array) {
    this.sent.push(data);
  }

  close() {
    this.closed = true;
    this.readyState = 3;
    this.onclose?.();
  }
}

test("emits connection lifecycle events and sends only while open", () => {
  const sockets: FakeSocket[] = [];
  const events: TransportEvent[] = [];
  const transport = new RoomTransport({
    url: "ws://room",
    socketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    reconnectDelays: [],
  });
  transport.subscribe((event) => events.push(event));

  expect(transport.send("before-open")).toBe(false);
  transport.connect();
  expect(events).toEqual([{ type: "status", status: "connecting" }]);
  sockets[0]!.open();
  expect(events).toContainEqual({ type: "status", status: "live" });
  expect(transport.send("after-open")).toBe(true);
  expect(sockets[0]!.sent).toEqual(["after-open"]);
  sockets[0]!.onmessage?.({ data: "message" });
  expect(events).toContainEqual({ type: "message", data: "message" });
});

test("ignores callbacks from a replaced socket", () => {
  const sockets: FakeSocket[] = [];
  const events: TransportEvent[] = [];
  const transport = new RoomTransport({
    url: "ws://room",
    socketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    reconnectDelays: [0],
  });
  transport.subscribe((event) => events.push(event));

  transport.connect();
  sockets[0]!.open();
  sockets[0]!.onclose?.();
  transport.connect();
  sockets[1]!.open();
  const count = events.length;
  sockets[0]!.onerror?.();
  sockets[0]!.onmessage?.({ data: "stale" });
  expect(events).toHaveLength(count);
});

test("manual disconnect cancels reconnect and reports offline", () => {
  const sockets: FakeSocket[] = [];
  const events: TransportEvent[] = [];
  const transport = new RoomTransport({
    url: "ws://room",
    socketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    reconnectDelays: [10],
  });
  transport.subscribe((event) => events.push(event));

  transport.connect();
  sockets[0]!.open();
  sockets[0]!.close();
  transport.disconnect();
  expect(transport.status).toBe("offline");
  expect(events).toContainEqual({ type: "status", status: "offline" });
});

test("requested reconnect invalidates old callbacks and schedules only one replacement", async () => {
  const sockets: FakeSocket[] = [];
  const events: TransportEvent[] = [];
  const transport = new RoomTransport({
    url: "ws://room",
    socketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    reconnectDelays: [10],
  });
  transport.subscribe((event) => events.push(event));
  try {
    transport.connect();
    sockets[0]!.open();
    expect(() => transport.reconnect()).not.toThrow();
    expect(transport.status).toBe("reconnecting");
    expect(sockets[0]!.closed).toBe(true);
    expect(transport.send("invalidated")).toBe(false);
    const count = events.length;
    sockets[0]!.onmessage?.({ data: "stale" });
    sockets[0]!.onclose?.();
    sockets[0]!.onerror?.();
    expect(events).toHaveLength(count);
    transport.reconnect();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(sockets).toHaveLength(2);
    sockets[1]!.open();
    expect(transport.send("new")).toBe(true);
    expect(sockets[1]!.sent).toEqual(["new"]);
  } finally {
    transport.disconnect();
  }
});

test("requested reconnect cannot revive a manually disconnected transport", async () => {
  const sockets: FakeSocket[] = [];
  const transport = new RoomTransport({
    url: "ws://room",
    socketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    reconnectDelays: [10],
  });
  try {
    transport.connect();
    sockets[0]!.open();
    expect(() => transport.reconnect()).not.toThrow();
    transport.disconnect();
    transport.reconnect();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(transport.status).toBe("offline");
    expect(sockets).toHaveLength(1);
  } finally {
    transport.disconnect();
  }
});

test("keeps reconnect backoff until a valid snapshot marks the connection healthy", async () => {
  const sockets: FakeSocket[] = [];
  const transport = new RoomTransport({
    url: "ws://room",
    socketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    reconnectDelays: [20, 120],
  });
  try {
    transport.connect();
    sockets[0]!.open();
    transport.reconnect();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(sockets).toHaveLength(2);

    sockets[1]!.open();
    sockets[1]!.close();
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(sockets).toHaveLength(2);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(sockets).toHaveLength(3);

    sockets[2]!.open();
    transport.markHealthy();
    sockets[2]!.close();
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(sockets).toHaveLength(4);
  } finally {
    transport.disconnect();
  }
});
