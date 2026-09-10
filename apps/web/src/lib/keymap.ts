export type AppAction = "file.search" | "settings.open" | "command.palette";
export type KeyBinding = { action: AppAction; key: string };

export const KEYMAP_ACTIONS: readonly AppAction[] = [
  "file.search",
  "settings.open",
  "command.palette",
];
export const DEFAULT_KEYMAP: readonly KeyBinding[] = [
  { action: "file.search", key: "Mod-P" },
  { action: "settings.open", key: "Mod-," },
  { action: "command.palette", key: "Mod-K" },
];

export function normalizeKey(event: KeyboardEvent): string | null {
  if (
    event.key === "Control" ||
    event.key === "Meta" ||
    event.key === "Alt" ||
    event.key === "Shift"
  )
    return null;
  const parts = [
    event.metaKey ? "Cmd" : "",
    event.ctrlKey ? "Ctrl" : "",
    event.altKey ? "Alt" : "",
    event.shiftKey ? "Shift" : "",
  ].filter(Boolean);
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  return [...parts, key].join("-");
}

export function matchesKeyBinding(event: KeyboardEvent, binding: string): boolean {
  const normalized = normalizeKey(event);
  if (!normalized) return false;
  const expected = binding.startsWith("Mod-")
    ? `${event.metaKey ? "Cmd" : "Ctrl"}${binding.slice(3)}`
    : binding;
  return normalized === expected;
}

export function readKeymap(): KeyBinding[] {
  try {
    const value = JSON.parse(localStorage.getItem("tsugite.keymap") ?? "null");
    return Array.isArray(value)
      ? KEYMAP_ACTIONS.map((action) => {
          const entry = value.find((candidate) => candidate?.action === action);
          return {
            action,
            key:
              typeof entry?.key === "string"
                ? entry.key
                : DEFAULT_KEYMAP.find((item) => item.action === action)!.key,
          };
        })
      : [...DEFAULT_KEYMAP];
  } catch {
    return [...DEFAULT_KEYMAP];
  }
}

export function writeKeymap(bindings: readonly KeyBinding[]) {
  localStorage.setItem("tsugite.keymap", JSON.stringify(bindings));
}
