import { expect, test } from "bun:test";

import {
  decodeJsonMessage,
  decodeServerJsonMessage,
  encodeJsonMessage,
  isPresenceMessage,
} from "./protocol";

test("encodes and decodes presence messages", () => {
  const message = {
    type: "presence" as const,
    userId: "user-1",
    displayName: "Maya",
    color: "#d88961",
  };

  expect(decodeJsonMessage(encodeJsonMessage(message))).toEqual(message);
  expect(isPresenceMessage(message)).toBe(true);
  expect(isPresenceMessage({ type: "join" })).toBe(false);
});

test("decodes only structurally valid server messages", () => {
  const presence = {
    type: "presence",
    userId: "user-1",
    displayName: "Maya",
    color: "#d88961",
    cursor: { anchor: 2, head: 3 },
  };

  expect(
    decodeServerJsonMessage(JSON.stringify({ type: "presence:list", members: [presence] })),
  ).toEqual({ type: "presence:list", members: [presence] });
  expect(
    decodeServerJsonMessage(JSON.stringify({ type: "presence:list", members: [null] })),
  ).toBeUndefined();
  expect(decodeServerJsonMessage(JSON.stringify({ ...presence, cursor: {} }))).toBeUndefined();
  expect(decodeServerJsonMessage("{")).toBeUndefined();
});
