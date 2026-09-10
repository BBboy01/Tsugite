import { expect, test } from "bun:test";

import { matchesKeyBinding } from "./keymap";

function event(overrides: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    key: "p",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides,
  } as KeyboardEvent;
}

test("Mod bindings require the platform modifier without extra modifiers", () => {
  expect(matchesKeyBinding(event({ ctrlKey: true }), "Mod-P")).toBe(true);
  expect(matchesKeyBinding(event({ altKey: true }), "Mod-P")).toBe(false);
  expect(matchesKeyBinding(event({ shiftKey: true }), "Mod-P")).toBe(false);
  expect(matchesKeyBinding(event({ ctrlKey: true, altKey: true }), "Mod-P")).toBe(false);
});
