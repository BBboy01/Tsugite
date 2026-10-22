import { expect, test } from "bun:test";

import {
  getRandomWorkspaceTheme,
  getHighlightsTheme,
  isDarkWorkspaceTheme,
  readRoomTheme,
  writeRoomTheme,
} from "./workspace-theme";

test("classifies workspace themes by their visual brightness", () => {
  expect(isDarkWorkspaceTheme("tokyo-night")).toBe(true);
  expect(isDarkWorkspaceTheme("github-light")).toBe(false);
});

test("loads every workspace theme as a Highlights theme", async () => {
  const expectedAppearance = new Map([
    ["paper", "light"],
    ["github-light", "light"],
    ["solarized-light", "light"],
    ["catppuccin-latte", "light"],
    ["ink", "dark"],
    ["github-dark", "dark"],
    ["solarized-dark", "dark"],
    ["tokyo-night", "dark"],
    ["dracula", "dark"],
    ["catppuccin-mocha", "dark"],
    ["nord", "dark"],
    ["gruvbox-dark-medium", "dark"],
    ["one-dark-pro", "dark"],
    ["rose-pine", "dark"],
    ["everforest-dark", "dark"],
    ["kanagawa-wave", "dark"],
  ] as const);

  for (const [theme, appearance] of expectedAppearance) {
    expect((await getHighlightsTheme(theme)).appearance).toBe(appearance);
  }
});

test("picks a different built-in theme", () => {
  expect(getRandomWorkspaceTheme("paper", () => 0)).not.toBe("paper");
  expect(getRandomWorkspaceTheme("paper", () => 0.999)).not.toBe("paper");
});

test("caches only valid themes for the matching room", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
  writeRoomTheme(storage, "a", "dracula");
  expect(readRoomTheme(storage, "a")).toBe("dracula");
  expect(readRoomTheme(storage, "b")).toBeNull();
  values.set("iris.room-theme.b", "unknown");
  expect(readRoomTheme(storage, "b")).toBeNull();
});

test("continues when browser storage is unavailable", () => {
  const storage = {
    getItem: (): string | null => {
      throw new Error("storage disabled");
    },
    setItem: (): void => {
      throw new Error("storage disabled");
    },
  };
  expect(readRoomTheme(storage, "a")).toBeNull();
  expect(() => writeRoomTheme(storage, "a", "paper")).not.toThrow();
});
