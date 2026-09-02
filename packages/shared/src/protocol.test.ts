import { expect, test } from "bun:test";

import { decodeJsonMessage, encodeJsonMessage, isPresenceMessage } from "./protocol";

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
