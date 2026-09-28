import { expect, test } from "bun:test";
import type { PresenceMessage } from "@iris/shared";
import { RoomPresence, type RoomIdentity } from "./room-presence";

function identity(): RoomIdentity {
  return { userId: "local", displayName: "Local", color: "#7389b7" };
}

test("preserves partial collaborator cursor data while merging presence", () => {
  const presence = new RoomPresence(identity(), () => {});
  presence.receive({
    type: "presence",
    userId: "remote",
    displayName: "Remote",
    color: "#d88961",
    selectedPath: "src/main.ts",
    cursor: { anchor: 3, head: 4 },
  });
  presence.receive({
    type: "presence",
    userId: "remote",
    displayName: "Renamed",
    color: "#d88961",
  } as PresenceMessage);

  expect(presence.members[0]).toMatchObject({
    displayName: "Renamed",
    selectedPath: "src/main.ts",
    cursor: { anchor: 3, head: 4 },
  });
});

test("sends local selection and cursor through the presence boundary", () => {
  const sent: PresenceMessage[] = [];
  const presence = new RoomPresence(identity(), (message) => sent.push(message));

  presence.send("src/App.tsx", { anchor: 2, head: 2 });
  presence.send(undefined, null);

  expect(sent).toEqual([
    expect.objectContaining({ selectedPath: "src/App.tsx", cursor: { anchor: 2, head: 2 } }),
    expect.objectContaining({ selectedPath: "src/App.tsx", cursor: null }),
  ]);
});

test("rejects invalid identity updates and emits valid changes", () => {
  const changes: string[] = [];
  const presence = new RoomPresence(
    identity(),
    () => {},
    () => changes.push("changed"),
  );

  expect(presence.updateDisplayName(" ")).toBe(false);
  expect(presence.updateColor("red")).toBe(false);
  expect(presence.updateDisplayName("Renamed")).toBe(true);
  expect(presence.updateColor("#D88961")).toBe(true);
  expect(changes).toEqual(["changed", "changed"]);
});
