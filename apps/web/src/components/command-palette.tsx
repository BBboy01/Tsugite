import * as Dialog from "@radix-ui/react-dialog";
import { Theme } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { memo, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectSettings, WorkspaceTheme } from "@iris/shared";

import {
  getRootCommands,
  getSubmenuCommands,
  getSubmenuLabel,
  type ExternalCommandId,
  type PaletteCommand,
  type Submenu,
} from "@/lib/command-palette-model";
import { getRandomWorkspaceTheme, isDarkWorkspaceTheme } from "@/lib/workspace-theme";
import type { RuntimeAction } from "@/lib/runtime-actions";
import type { LanguageCode } from "@/lib/i18n";
import type { KeyBinding } from "@/lib/keymap";

import { CommandPaletteResults } from "./command-palette-results";
import { CommandPaletteSearch } from "./command-palette-search";
import { useSystemClipboard } from "../lib/use-system-clipboard";
import { commandPaletteOpenAtom } from "../lib/workspace-atoms";

type CommandPaletteProps = {
  settings: ProjectSettings;
  previewTheme: WorkspaceTheme | null;
  vimMode: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (command: ExternalCommandId) => void;
  onSettingChange: <K extends keyof ProjectSettings>(key: K, value: ProjectSettings[K]) => void;
  onThemePreview: (theme: WorkspaceTheme | null) => void;
  onVimModeChange: (enabled: boolean) => void;
  onRuntimeAction: (action: RuntimeAction) => void;
  onTogglePreviewConsole: () => void;
  onLanguageChange: (language: LanguageCode) => void;
  keymap: readonly KeyBinding[];
  onCloseAutoFocus: () => void;
};

export const CommandPalette = memo(function CommandPalette({
  settings,
  previewTheme,
  vimMode,
  onOpenChange,
  onSelect,
  onSettingChange,
  onThemePreview,
  onVimModeChange,
  onRuntimeAction,
  onTogglePreviewConsole,
  onLanguageChange,
  keymap,
  onCloseAutoFocus,
}: CommandPaletteProps) {
  const open = useAtomValue(commandPaletteOpenAtom);
  const { t } = useTranslation();
  const [systemClipboard, setSystemClipboard] = useSystemClipboard();
  const inputRef = useRef<HTMLInputElement>(null);
  const shouldReturnFocusRef = useRef(true);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [submenu, setSubmenu] = useState<Submenu | null>(null);
  const visualTheme = previewTheme ?? settings.theme;
  const isDark = isDarkWorkspaceTheme(visualTheme);

  const rootCommands = getRootCommands(settings, vimMode, systemClipboard, t, keymap);
  const submenuLabel = submenu ? getSubmenuLabel(submenu, t) : null;
  const submenuCommands = submenu ? getSubmenuCommands(submenu, settings, t) : [];

  const commands = (submenu ? submenuCommands : rootCommands).filter((command) =>
    (command.searchText ?? command.label).toLowerCase().includes(query.toLowerCase()),
  );

  useEffect(() => {
    onThemePreview(null);
    if (!open) {
      return;
    }

    shouldReturnFocusRef.current = true;
    setQuery("");
    setSelectedIndex(0);
    setSubmenu(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [onThemePreview, open]);

  useEffect(() => {
    setSelectedIndex((index) => Math.min(index, Math.max(commands.length - 1, 0)));
  }, [commands.length]);

  const selectedCommand = commands[selectedIndex];
  useEffect(() => {
    if (!open || submenu !== "theme") return;
    onThemePreview(selectedCommand?.scope === "theme" ? selectedCommand.id : settings.theme);
  }, [onThemePreview, open, selectedCommand?.id, settings.theme, submenu]);

  const returnToRoot = () => {
    if (submenu === "theme") onThemePreview(null);
    setQuery("");
    setSelectedIndex(0);
    setSubmenu(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const openSubmenu = (nextSubmenu: Submenu) => {
    setQuery("");
    const nextCommands = getSubmenuCommands(nextSubmenu, settings, t);
    const currentIndex = nextCommands.findIndex((command) => command.selected);
    setSelectedIndex(currentIndex >= 0 ? currentIndex : 0);
    setSubmenu(nextSubmenu);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const selectExternalCommand = (command: ExternalCommandId) => {
    shouldReturnFocusRef.current = false;
    onSelect(command);
    onOpenChange(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) onThemePreview(null);
    onOpenChange(nextOpen);
    if (!nextOpen && shouldReturnFocusRef.current) {
      requestAnimationFrame(() => requestAnimationFrame(onCloseAutoFocus));
    }
  };

  const closePalette = () => handleOpenChange(false);

  const activate = (command: PaletteCommand) => {
    switch (command.scope) {
      case "language":
        onLanguageChange(command.id);
        closePalette();
        return;
      case "theme":
        onSettingChange("theme", command.id);
        closePalette();
        return;
      case "normalCursor":
        onSettingChange("normalCursorStyle", command.id);
        closePalette();
        return;
      case "packageManager":
        onSettingChange("packageManager", command.id);
        closePalette();
        return;
      case "root":
        break;
      default:
        return assertNever(command);
    }

    switch (command.id) {
      case "file.search":
      case "settings.open":
        selectExternalCommand(command.id);
        return;
      case "preview.console.toggle":
        onTogglePreviewConsole();
        closePalette();
        return;
      case "language.choose":
        openSubmenu("language");
        return;
      case "theme.random":
        onSettingChange("theme", getRandomWorkspaceTheme(settings.theme));
        closePalette();
        return;
      case "theme.choose":
        openSubmenu("theme");
        return;
      case "cursor.choose":
        openSubmenu("normalCursor");
        return;
      case "packageManager.choose":
        openSubmenu("packageManager");
        return;
      case "vim.toggle":
        onVimModeChange(!vimMode);
        closePalette();
        return;
      case "systemClipboard.toggle":
        setSystemClipboard(!systemClipboard);
        closePalette();
        return;
      case "wordWrap.toggle":
        onSettingChange("wordWrap", !settings.wordWrap);
        closePalette();
        return;
      case "relativeLineNumbers.toggle":
        onSettingChange("relativeLineNumbers", !settings.relativeLineNumbers);
        closePalette();
        return;
      case "autoInstall.toggle":
        onSettingChange("autoInstall", !settings.autoInstall);
        closePalette();
        return;
      case "autoStartPreview.toggle":
        onSettingChange("autoStartPreview", !settings.autoStartPreview);
        closePalette();
        return;
      case "runtime.restart":
        onRuntimeAction("restart");
        closePalette();
        return;
      case "runtime.reinstall":
        onRuntimeAction("reinstall");
        closePalette();
        return;
      default:
        return assertNever(command);
    }
  };

  const moveSelection = (offset: number) => {
    if (commands.length === 0) {
      return;
    }

    setSelectedIndex((index) => (index + offset + commands.length) % commands.length);
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Theme
          appearance={isDark ? "dark" : "light"}
          accentColor="blue"
          grayColor="gray"
          hasBackground={false}
          radius="medium"
          scaling="100%"
          className={`theme-${visualTheme}`}
        >
          <Dialog.Overlay data-dialog-overlay className="fixed inset-0 z-50 bg-black/30" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed left-1/2 top-[18%] z-50 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-iris-divider bg-iris-canvas text-iris-ink shadow-2xl outline-none"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
            }}
            onEscapeKeyDown={(event) => event.preventDefault()}
            onKeyDownCapture={(event) => {
              if (event.key !== "Escape") return;
              event.preventDefault();
              event.stopPropagation();
              if (submenu) returnToRoot();
              else closePalette();
            }}
          >
            <Dialog.Title className="sr-only">{t("command.title")}</Dialog.Title>
            <CommandPaletteSearch
              inputRef={inputRef}
              query={query}
              placeholder={
                submenuLabel
                  ? `${submenuLabel}: ${t("command.placeholder")}`
                  : t("command.placeholder")
              }
              backLabel={submenu ? t("command.back") : undefined}
              commands={commands}
              selectedIndex={selectedIndex}
              onQueryChange={(value) => {
                setQuery(value);
                setSelectedIndex(0);
              }}
              onBack={submenu ? returnToRoot : undefined}
              onActivate={activate}
              onMoveSelection={moveSelection}
            />
            <CommandPaletteResults
              commands={commands}
              selectedIndex={selectedIndex}
              query={query}
              onHighlight={setSelectedIndex}
              onSelect={activate}
            />
          </Dialog.Content>
        </Theme>
      </Dialog.Portal>
    </Dialog.Root>
  );
});

function assertNever(value: never): never {
  throw new Error(`Unhandled command palette value: ${JSON.stringify(value)}`);
}
