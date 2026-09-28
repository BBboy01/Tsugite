import { useEffect } from "react";
import { matchesKeyBinding, type KeyBinding } from "./keymap";

type WorkspaceShortcutsOptions = {
  keymap: readonly KeyBinding[];
  setSettingsOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setFileSearchOpen: (open: boolean) => void;
  togglePreviewConsole: () => void;
};

export function useWorkspaceShortcuts({
  keymap,
  setSettingsOpen,
  setCommandPaletteOpen,
  setFileSearchOpen,
  togglePreviewConsole,
}: WorkspaceShortcutsOptions): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (document.querySelector("[data-draft-recovery]")) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.matches("input, textarea")) return;
      if (matchesKeyBinding(event, "Mod-,")) {
        event.preventDefault();
        setSettingsOpen(true);
        return;
      }
      const commandBinding = keymap.find((candidate) => candidate.action === "command.palette");
      if (commandBinding && matchesKeyBinding(event, commandBinding.key)) {
        event.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }
      const fileSearchBinding = keymap.find((candidate) => candidate.action === "file.search");
      if (fileSearchBinding && matchesKeyBinding(event, fileSearchBinding.key)) {
        event.preventDefault();
        setFileSearchOpen(true);
        return;
      }
      const consoleBinding = keymap.find((candidate) => candidate.action === "preview.console");
      if (consoleBinding && matchesKeyBinding(event, consoleBinding.key)) {
        event.preventDefault();
        togglePreviewConsole();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [keymap, setCommandPaletteOpen, setFileSearchOpen, setSettingsOpen, togglePreviewConsole]);
}
