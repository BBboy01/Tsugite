import { expect, test } from "bun:test";
import { LoroDoc } from "loro-crdt";
import { RoomDocument, type RoomDocumentEvent } from "./room-document";

test("classifies local document changes and forwards local updates", () => {
  const updates: Uint8Array[] = [];
  const events: RoomDocumentEvent[] = [];
  const document = new RoomDocument((bytes) => updates.push(bytes));
  document.subscribe((event) => events.push(event));

  document.doc.getText("file:main.ts").insert(0, "hello");
  document.doc.commit();

  expect(updates).toHaveLength(1);
  expect(events).toContainEqual({
    type: "document",
    changes: { workspace: false, settings: false, content: true },
  });
});

test("marks the first binary import in a connection as the room snapshot", () => {
  const events: RoomDocumentEvent[] = [];
  const document = new RoomDocument(() => {});
  document.subscribe((event) => events.push(event));
  const source = new LoroDoc();
  source.getText("text").insert(0, "snapshot");

  document.beginConnection();
  document.importRemote(source.export({ mode: "snapshot" }));

  expect(document.hasReceivedSnapshot).toBe(true);
  expect(events).toContainEqual({ type: "snapshot" });
  expect(document.doc.getText("text").toString()).toBe("snapshot");
});

test("validates a pending draft before importing it", () => {
  const document = new RoomDocument(() => {});
  document.doc.getText("text").insert(0, "current");
  document.doc.commit();
  const before = document.doc.export({ mode: "snapshot" });

  expect(() => document.restorePendingDraft(new Uint8Array([1, 2, 3]), [])).toThrow();
  expect(document.doc.export({ mode: "snapshot" })).toEqual(before);
});

for (const corruption of ["header", "checksum", "truncated"] as const) {
  test(`isolates a ${corruption} import failure without losing local state`, () => {
    const events: RoomDocumentEvent[] = [];
    const document = new RoomDocument(() => {});
    document.doc.getText("text").insert(0, "local");
    document.doc.commit();
    document.subscribe((event) => events.push(event));
    const before = document.doc.export({ mode: "snapshot" });
    const source = new LoroDoc();
    source.getText("remote").insert(0, "remote");
    const snapshot = source.export({ mode: "snapshot" });
    const invalid = snapshot.slice();
    invalid[corruption === "header" ? 0 : invalid.length - 1] ^= 0xff;

    expect(() =>
      document.importRemote(corruption === "truncated" ? snapshot.slice(0, -1) : invalid),
    ).not.toThrow();
    expect(events).toEqual([{ type: "import-error" }]);
    expect(document.hasReceivedSnapshot).toBe(false);
    expect(document.doc.export({ mode: "snapshot" })).toEqual(before);

    document.importRemote(snapshot);
    expect(document.hasReceivedSnapshot).toBe(true);
    expect(document.doc.getText("text").toString()).toBe("local");
    expect(document.doc.getText("remote").toString()).toBe("remote");
    expect(events.at(-1)).toEqual({ type: "snapshot" });
    source.free();
  });
}
