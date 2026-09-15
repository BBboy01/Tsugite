import { expect, test } from "bun:test";

import { findKeymapConflict, formatKeyBinding, matchesKeyBinding } from "./keymap";

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
  expect(matchesKeyBinding(event({ ctrlKey: true }), "Mod-P", "Linux x86_64")).toBe(true);
  expect(matchesKeyBinding(event({ metaKey: true }), "Mod-P", "Linux x86_64")).toBe(false);
  expect(matchesKeyBinding(event({ metaKey: true }), "Mod-P", "MacIntel")).toBe(true);
  expect(matchesKeyBinding(event({ ctrlKey: true }), "Mod-P", "MacIntel")).toBe(false);
  expect(matchesKeyBinding(event({ altKey: true }), "Mod-P")).toBe(false);
  expect(matchesKeyBinding(event({ shiftKey: true }), "Mod-P")).toBe(false);
  expect(matchesKeyBinding(event({ ctrlKey: true, altKey: true }), "Mod-P")).toBe(false);
});

test("custom Cmd and Ctrl bindings stay distinct", () => {
  expect(matchesKeyBinding(event({ metaKey: true }), "Cmd-P", "MacIntel")).toBe(true);
  expect(matchesKeyBinding(event({ ctrlKey: true }), "Cmd-P", "MacIntel")).toBe(false);
  expect(matchesKeyBinding(event({ ctrlKey: true }), "Ctrl-P", "Linux x86_64")).toBe(true);
  expect(matchesKeyBinding(event({ metaKey: true }), "Ctrl-P", "Linux x86_64")).toBe(false);
});

test("Mod bindings display the platform modifier name", () => {
  expect(formatKeyBinding("Mod-P", "MacIntel")).toBe("Cmd-P");
  expect(formatKeyBinding("Mod-P", "Linux x86_64")).toBe("Ctrl-P");
  expect(formatKeyBinding("Cmd-P", "MacIntel")).toBe("Cmd-P");
  expect(formatKeyBinding("Ctrl-P", "Linux x86_64")).toBe("Ctrl-P");
});

test("keymap conflicts use the current platform modifier", () => {
  const bindings = [
    { action: "file.search" as const, key: "Mod-P" },
    { action: "settings.open" as const, key: "Cmd-Q" },
    { action: "command.palette" as const, key: "Ctrl-K" },
  ];
  expect(findKeymapConflict(bindings, "command.palette", "Mod-K", "Linux x86_64")).toBeNull();
  expect(findKeymapConflict(bindings, "command.palette", "Mod-P", "Linux x86_64")).toBe(
    "file.search",
  );
  expect(findKeymapConflict(bindings, "command.palette", "Mod-P", "MacIntel")).toBe("file.search");
  expect(findKeymapConflict(bindings, "command.palette", "Cmd-P", "Linux x86_64")).toBeNull();
});
