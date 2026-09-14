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

export function isMacPlatform(platform: string = globalThis.navigator?.platform ?? ""): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(platform);
}

export function formatKeyBinding(
  binding: string,
  platform: string = globalThis.navigator?.platform ?? "",
) {
  if (!binding.startsWith("Mod-")) return binding;
  return `${isMacPlatform(platform) ? "⌘" : "Ctrl"}-${binding.slice(4)}`;
}

function comparableKey(binding: string, platform: string) {
  if (binding.startsWith("Mod-")) {
    return `${isMacPlatform(platform) ? "Cmd" : "Ctrl"}${binding.slice(3)}`;
  }
  return binding;
}

export function findKeymapConflict(
  bindings: readonly KeyBinding[],
  action: AppAction,
  key: string,
  platform: string = globalThis.navigator?.platform ?? "",
): AppAction | null {
  const comparable = comparableKey(key, platform);
  return (
    bindings.find(
      (binding) => binding.action !== action && comparableKey(binding.key, platform) === comparable,
    )?.action ?? null
  );
}

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

export function matchesKeyBinding(
  event: KeyboardEvent,
  binding: string,
  platform = globalThis.navigator?.platform ?? "",
): boolean {
  const normalized = normalizeKey(event);
  if (!normalized) return false;
  const expected = binding.startsWith("Mod-")
    ? `${isMacPlatform(platform) ? "Cmd" : "Ctrl"}${binding.slice(3)}`
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
