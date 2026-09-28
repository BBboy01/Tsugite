import { expect, test } from "bun:test";

import type { ProjectSettings } from "@iris/shared";
import i18n from "./i18n";
import { getRootCommands, getSubmenuCommands, type Submenu } from "./command-palette-model";

const settings: ProjectSettings = {
  theme: "paper",
  fontFamily: "monospace",
  fontSize: 14,
  wordWrap: false,
  relativeLineNumbers: false,
  normalCursorStyle: "block",
  packageManager: "pnpm",
  autoInstall: false,
  autoStartPreview: false,
};

test("tags root and submenu commands with their owning scope", () => {
  const rootCommands = getRootCommands(settings, false, false, i18n.t, []);
  expect(rootCommands.every((command) => command.scope === "root")).toBe(true);

  const submenus: Submenu[] = ["language", "theme", "normalCursor", "packageManager"];
  for (const submenu of submenus) {
    const commands = getSubmenuCommands(submenu, settings, i18n.t);
    expect(commands.length).toBeGreaterThan(0);
    expect(commands.every((command) => command.scope === submenu)).toBe(true);
  }
});
