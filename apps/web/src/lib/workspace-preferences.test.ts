import { describe, expect, it } from "bun:test";

import { readVimMode, writeVimMode } from "./workspace-preferences";

function createStorage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key: string, nextValue: string) => {
      value = nextValue;
    },
  };
}

describe("workspace preferences", () => {
  it("defaults Vim mode to disabled when no browser preference exists", () => {
    expect(readVimMode(createStorage())).toBe(false);
    expect(readVimMode(undefined)).toBe(false);
  });

  it("round-trips Vim mode through the browser preference", () => {
    const storage = createStorage();
    writeVimMode(storage, true);
    expect(readVimMode(storage)).toBe(true);
    writeVimMode(storage, false);
    expect(readVimMode(storage)).toBe(false);
  });
});
