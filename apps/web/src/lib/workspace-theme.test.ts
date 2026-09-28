import { expect, test } from "bun:test";

import {
  getRandomWorkspaceTheme,
  getShikiTheme,
  isDarkWorkspaceTheme,
  readRoomTheme,
  writeRoomTheme,
} from "./workspace-theme";

test("classifies workspace themes by their visual brightness", () => {
  expect(isDarkWorkspaceTheme("tokyo-night")).toBe(true);
  expect(isDarkWorkspaceTheme("github-light")).toBe(false);
});

test("maps workspace themes to matching Shiki themes", () => {
  expect(getShikiTheme("ink")).toBe("vitesse-dark");
  expect(getShikiTheme("github-light")).toBe("github-light");
  expect(getShikiTheme("catppuccin-mocha")).toBe("catppuccin-mocha");
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
