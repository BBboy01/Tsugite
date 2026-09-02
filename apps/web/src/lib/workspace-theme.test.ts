import { expect, test } from "bun:test";

import { getRandomWorkspaceTheme, getShikiTheme, isDarkWorkspaceTheme } from "./workspace-theme";

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
