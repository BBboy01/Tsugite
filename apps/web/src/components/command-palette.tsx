import * as Dialog from "@radix-ui/react-dialog";
import { Theme } from "@radix-ui/themes";
import { ArrowLeft, Check, Command } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ProjectSettings, WorkspaceTheme } from "@iris/shared";

import {
  getRootCommands,
  getSubmenuCommands,
  getSubmenuLabel,
  type CommandId,
  type PaletteCommand,
  type Submenu,
} from "@/lib/command-palette-model";
import { getRandomWorkspaceTheme, isDarkWorkspaceTheme } from "@/lib/workspace-theme";
import type { RuntimeAction } from "@/lib/runtime-actions";
import type { LanguageCode } from "@/lib/i18n";
import type { KeyBinding } from "@/lib/keymap";

import { useCommandPaletteSelectionScroll } from "./use-command-palette-selection-scroll";

function highlightCommandLabel(label: string, query: string) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return label;
  const start = label.toLocaleLowerCase().indexOf(normalizedQuery.toLocaleLowerCase());
  if (start < 0) return label;
  const end = start + normalizedQuery.length;
  return (
    <>
      {label.slice(0, start)}
      <mark className="rounded-[2px] bg-[color-mix(in_srgb,var(--accent)_28%,transparent)] px-0.5 text-inherit">
        {label.slice(start, end)}
      </mark>
      {label.slice(end)}
    </>
  );
}

type CommandPaletteProps = {
  open: boolean;
  settings: ProjectSettings;
  vimMode: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (command: CommandId) => void;
  onSettingChange: <K extends keyof ProjectSettings>(key: K, value: ProjectSettings[K]) => void;
  onVimModeChange: (enabled: boolean) => void;
  onRuntimeAction: (action: RuntimeAction) => void;
  onLanguageChange: (language: LanguageCode) => void;
  keymap: readonly KeyBinding[];
  onCloseAutoFocus: () => void;
};

export function CommandPalette({
  open,
  settings,
  vimMode,
  onOpenChange,
  onSelect,
  onSettingChange,
  onVimModeChange,
  onRuntimeAction,
  onLanguageChange,
  keymap,
  onCloseAutoFocus,
}: CommandPaletteProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const shouldReturnFocusRef = useRef(true);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [submenu, setSubmenu] = useState<Submenu | null>(null);
  const isDark = isDarkWorkspaceTheme(settings.theme);

  const rootCommands = getRootCommands(settings, vimMode, t, keymap);
  const submenuLabel = submenu ? getSubmenuLabel(submenu, t) : null;
  const submenuCommands = submenu ? getSubmenuCommands(submenu, settings, t) : [];

  const commands = (submenu ? submenuCommands : rootCommands).filter((command) =>
    (command.searchText ?? command.label).toLowerCase().includes(query.toLowerCase()),
  );
  const { commandListRef, registerCommand } = useCommandPaletteSelectionScroll(
    commands,
    selectedIndex,
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    shouldReturnFocusRef.current = true;
    setQuery("");
    setSelectedIndex(0);
    setSubmenu(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    setSelectedIndex((index) => Math.min(index, Math.max(commands.length - 1, 0)));
  }, [commands.length]);

  const returnToRoot = () => {
    setQuery("");
    setSelectedIndex(0);
    setSubmenu(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const openSubmenu = (nextSubmenu: Submenu) => {
    setQuery("");
    setSelectedIndex(0);
    setSubmenu(nextSubmenu);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const selectExternalCommand = (command: CommandId) => {
    shouldReturnFocusRef.current = false;
    onSelect(command);
    onOpenChange(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen && shouldReturnFocusRef.current) {
      requestAnimationFrame(() => requestAnimationFrame(onCloseAutoFocus));
    }
  };

  const closePalette = () => handleOpenChange(false);

  const activate = (command: PaletteCommand) => {
    if (submenu === "language") {
      onLanguageChange(command.id as LanguageCode);
      closePalette();
      return;
    }
    if (submenu === "theme") {
      onSettingChange("theme", command.id as WorkspaceTheme);
      closePalette();
      return;
    }

    if (submenu === "normalCursor") {
      onSettingChange("normalCursorStyle", command.id as ProjectSettings["normalCursorStyle"]);
      closePalette();
      return;
    }

    if (submenu === "packageManager") {
      onSettingChange("packageManager", command.id as ProjectSettings["packageManager"]);
      closePalette();
      return;
    }

    switch (command.id) {
      case "file.search":
      case "settings.open":
        selectExternalCommand(command.id);
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
      case "runtime.reinstall":
        onRuntimeAction(command.id.slice("runtime.".length) as RuntimeAction);
        closePalette();
        return;
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
          className={`theme-${settings.theme}`}
        >
          <Dialog.Overlay className="glass-overlay fixed inset-0 z-50 bg-black/30 backdrop-blur-[1px]" />
          <Dialog.Content
            aria-describedby={undefined}
            className="glass-dialog fixed left-1/2 top-[18%] z-50 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] text-iris-ink shadow-2xl outline-none"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
            }}
            onEscapeKeyDown={(event) => {
              if (submenu) {
                event.preventDefault();
                returnToRoot();
              }
            }}
          >
            <Dialog.Title className="sr-only">{t("command.title")}</Dialog.Title>
            <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2.5">
              {submenu ? (
                <button
                  type="button"
                  aria-label={t("command.back")}
                  title={t("command.back")}
                  className="grid size-7 shrink-0 place-items-center text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
                  onClick={returnToRoot}
                >
                  <ArrowLeft size={16} aria-hidden="true" />
                </button>
              ) : (
                <Command size={16} aria-hidden="true" className="shrink-0 text-[var(--muted)]" />
              )}
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    const command = commands[selectedIndex];
                    if (command) {
                      activate(command);
                    }
                    return;
                  }

                  if ((event.ctrlKey || event.metaKey) && event.key === "n") {
                    event.preventDefault();
                    moveSelection(1);
                    return;
                  }

                  if ((event.ctrlKey || event.metaKey) && event.key === "p") {
                    event.preventDefault();
                    moveSelection(-1);
                  }
                }}
                placeholder={
                  submenuLabel
                    ? `${submenuLabel}: ${t("command.placeholder")}`
                    : t("command.placeholder")
                }
                spellCheck={false}
                className="min-w-0 flex-1 bg-transparent text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)]"
              />
            </div>
            <div
              ref={commandListRef}
              className="max-h-[min(22rem,calc(100vh-12rem))] overflow-y-auto p-1.5"
            >
              {commands.length > 0 ? (
                commands.map((command, index) => {
                  const Icon = command.icon;

                  return (
                    <button
                      key={command.id}
                      type="button"
                      ref={(element) => registerCommand(command.id, element)}
                      className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-none ${
                        selectedIndex === index
                          ? "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--foreground)]"
                          : "text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
                      }`}
                      onMouseEnter={() => setSelectedIndex(index)}
                      onClick={() => activate(command)}
                    >
                      <Icon
                        size={16}
                        aria-hidden="true"
                        className={`shrink-0 ${command.iconClassName ?? ""}`}
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {highlightCommandLabel(command.label, query)}
                      </span>
                      {command.shortcut ? (
                        <span className="shrink-0 font-iris-mono text-[10px] text-[color-mix(in_srgb,var(--muted)_62%,transparent)]">
                          {command.shortcut}
                        </span>
                      ) : null}
                      {command.selected ? (
                        <Check
                          size={16}
                          aria-hidden="true"
                          className="shrink-0 text-[var(--accent)]"
                        />
                      ) : null}
                    </button>
                  );
                })
              ) : (
                <p className="px-3 py-8 text-center text-sm text-[var(--muted)]">
                  {t("command.empty")}
                </p>
              )}
            </div>
          </Dialog.Content>
        </Theme>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
