import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, Code2, Keyboard, Palette, Rocket, Settings, X } from "lucide-react";
import { IconButton, Switch, Theme } from "@radix-ui/themes";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { PackageManager, ProjectSettings } from "@iris/shared";
import { KEYMAP_ACTIONS, normalizeKey, type KeyBinding } from "../lib/keymap";

import { languageOptions, type LanguageCode } from "../lib/i18n";
import { isDarkWorkspaceTheme } from "../lib/workspace-theme";
import { dispatchRuntimeAction, RUNTIME_ACTIONS, type RuntimeAction } from "../lib/runtime-actions";
import { getSettingDefinition, getSettingsByScope } from "../lib/settings-registry";

import { FontFamilyPicker, FontSizeSlider } from "./editor-settings-controls";
import { ThemePicker } from "./theme-picker";

export const SETTINGS_DIALOG_THEME_CLASS_NAME = "settings-dialog-theme";

type SettingsDialogProps = {
  settings: ProjectSettings;
  onChange: <K extends keyof ProjectSettings>(key: K, value: ProjectSettings[K]) => void;
  vimMode: boolean;
  onVimModeChange: (enabled: boolean) => void;
  keymap: KeyBinding[];
  onKeymapChange: (bindings: KeyBinding[]) => void;
  onLanguageChange: (language: LanguageCode) => void;
};

type SettingsSection = "workspace" | "editor" | "keyboard" | "runtime";

type NavigationEntry =
  | { kind: "section"; id: SettingsSection; label: string; description: string }
  | {
      kind: "setting";
      id: string;
      scope: SettingsSection;
      label: string;
      description: string;
    };

const sectionScopes: SettingsSection[] = ["workspace", "editor", "keyboard", "runtime"];

const packageManagers: PackageManager[] = ["pnpm", "npm", "yarn"];

export function SettingsPopover({
  settings,
  onChange,
  vimMode,
  onVimModeChange,
  keymap,
  onKeymapChange,
  onLanguageChange,
}: SettingsDialogProps) {
  const { i18n, t } = useTranslation();
  const settingLabel = (id: string) => t(getSettingDefinition(id)?.labelKey ?? id);
  const settingDescription = (id: string) => {
    const key = getSettingDefinition(id)?.descriptionKey;
    return key ? t(key) : "";
  };
  const [open, setOpen] = useState(false);
  const returnFocusRef = useRef(false);
  useEffect(() => {
    const openSettings = (event: Event) => {
      returnFocusRef.current =
        (event as CustomEvent<{ returnFocus?: boolean }>).detail?.returnFocus === true;
      setOpen(true);
    };
    window.addEventListener("iris:open-settings", openSettings);
    return () => window.removeEventListener("iris:open-settings", openSettings);
  }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      const shouldReturnFocus = returnFocusRef.current;
      returnFocusRef.current = false;
      if (shouldReturnFocus) {
        window.setTimeout(() => window.dispatchEvent(new Event("iris:settings-closed")), 0);
      }
    }
  };
  const [section, setSection] = useState<SettingsSection>("workspace");
  const [query, setQuery] = useState("");
  const [activeEntryId, setActiveEntryId] = useState("section:workspace");
  const searchRef = useRef<HTMLInputElement>(null);
  const sidebarEntryRefs = useRef(new Map<string, HTMLButtonElement>());
  const contentRef = useRef<HTMLDivElement>(null);

  const sections: Array<{ id: SettingsSection; icon: typeof Code2; label: string }> = [
    { id: "workspace", icon: Palette, label: t("settings.nav.workspace") },
    { id: "editor", icon: Code2, label: t("settings.nav.editor") },
    { id: "keyboard", icon: Keyboard, label: t("settings.nav.keyboard") },
    { id: "runtime", icon: Rocket, label: t("settings.nav.runtime") },
  ];

  const navigationEntries = useMemo<NavigationEntry[]>(() => {
    const entries: NavigationEntry[] = [];
    for (const scope of sectionScopes) {
      const sectionDefinition = {
        kind: "section" as const,
        id: scope,
        label: t(`settings.nav.${scope}`),
        description: t(`settings.section.${scope}.description`),
      };
      entries.push(sectionDefinition);
      for (const setting of getSettingsByScope(scope)) {
        entries.push({
          kind: "setting",
          id: setting.id,
          scope,
          label: t(setting.labelKey),
          description: setting.descriptionKey ? t(setting.descriptionKey) : "",
        });
      }
    }
    return entries;
  }, [t]);

  const visibleEntries = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return navigationEntries.filter((entry) => entry.kind === "section");
    const matched = navigationEntries.filter(
      (entry) =>
        entry.label.toLocaleLowerCase().includes(normalized) ||
        entry.description.toLocaleLowerCase().includes(normalized),
    );
    const scopes = new Set(
      matched.map((entry) => (entry.kind === "section" ? entry.id : entry.scope)),
    );
    return navigationEntries.filter(
      (entry) =>
        scopes.has(entry.kind === "section" ? entry.id : entry.scope) &&
        (entry.kind === "section" ||
          matched.some((match) => match.kind === "section" || match.id === entry.id)),
    );
  }, [navigationEntries, query]);

  const activateEntry = (entry: NavigationEntry, behavior: ScrollBehavior = "instant") => {
    setActiveEntryId(`${entry.kind}:${entry.id}`);
    setSection(entry.kind === "section" ? entry.id : entry.scope);
    if (entry.kind === "setting") {
      requestAnimationFrame(() => {
        const target = contentRef.current?.querySelector<HTMLElement>(
          `[data-setting-id="${entry.id}"]`,
        );
        target?.scrollIntoView({ block: "nearest", behavior });
      });
    }
  };

  useEffect(() => {
    const first = query.trim()
      ? (visibleEntries.find((entry) => entry.kind === "setting") ?? visibleEntries[0])
      : visibleEntries[0];
    if (first) activateEntry(first);
  }, [query, visibleEntries]);

  const focusVisibleEntry = (offset: number) => {
    const currentIndex = Math.max(
      0,
      visibleEntries.findIndex((entry) => `${entry.kind}:${entry.id}` === activeEntryId),
    );
    const next =
      visibleEntries[(currentIndex + offset + visibleEntries.length) % visibleEntries.length];
    if (!next) return;
    activateEntry(next);
    requestAnimationFrame(() => sidebarEntryRefs.current.get(`${next.kind}:${next.id}`)?.focus());
  };

  const focusContentEdge = (fromStart: boolean) => {
    const focusables = contentRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]',
    );
    const target = focusables?.[fromStart ? 0 : Math.max(0, focusables.length - 1)];
    target?.focus();
  };

  const handleSidebarEntryKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusVisibleEntry(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusVisibleEntry(-1);
    } else if (event.key === "Tab" && !event.shiftKey) {
      event.preventDefault();
      searchRef.current?.focus();
    } else if (event.key === "Tab" && event.shiftKey) {
      event.preventDefault();
      focusContentEdge(false);
    }
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusVisibleEntry(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusVisibleEntry(-1);
    } else if (event.key === "Tab" && !event.shiftKey) {
      event.preventDefault();
      focusContentEdge(true);
    } else if (event.key === "Tab" && event.shiftKey) {
      event.preventDefault();
      sidebarEntryRefs.current.get(activeEntryId)?.focus();
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <motion.button
          className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg border-0 bg-transparent p-0 text-iris-muted transition-[background-color,color,box-shadow] duration-150 hover:bg-[color-mix(in_srgb,var(--glass-popover)_88%,transparent)] hover:text-iris-strong hover:shadow-[0_2px_8px_color-mix(in_srgb,var(--ink-strong)_12%,transparent)] focus-visible:bg-[color-mix(in_srgb,var(--glass-popover)_88%,transparent)] focus-visible:text-iris-strong focus-visible:outline-2 focus-visible:outline-[color-mix(in_srgb,var(--accent)_36%,transparent)]"
          type="button"
          aria-label={t("settings.open")}
          title={t("settings.open")}
          onPointerDown={() => {
            returnFocusRef.current = true;
          }}
          whileTap={{ scale: 0.96 }}
        >
          <Settings width="14" height="14" />
        </motion.button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Theme
          appearance={isDarkWorkspaceTheme(settings.theme) ? "dark" : "light"}
          accentColor="blue"
          grayColor="gray"
          hasBackground={false}
          radius="medium"
          scaling="100%"
          className={SETTINGS_DIALOG_THEME_CLASS_NAME}
        >
          <Dialog.Overlay className="glass-overlay settings-overlay fixed inset-0 z-50" />
          <Dialog.Content
            className={`theme-${settings.theme} glass-dialog fixed left-1/2 top-1/2 z-50 grid h-[min(78vh,560px)] w-[min(92vw,760px)] -translate-x-1/2 -translate-y-1/2 grid-cols-[180px_minmax(0,1fr)] overflow-visible rounded-[14px] border border-iris-divider bg-iris-preview text-iris-ink shadow-[0_24px_70px_rgba(38,49,41,0.22)] focus:outline-none max-[760px]:h-[min(86vh,680px)] max-[760px]:w-[min(94vw,560px)] max-[760px]:grid-cols-1 max-[760px]:grid-rows-[auto_minmax(0,1fr)]`}
            onCloseAutoFocus={(event) => {
              if (returnFocusRef.current) event.preventDefault();
            }}
          >
            <aside className="settings-sidebar-glass flex min-h-0 flex-col rounded-l-[14px] border-r border-iris-divider p-3 max-[760px]:rounded-l-none max-[760px]:rounded-t-[14px] max-[760px]:overflow-y-auto max-[760px]:border-b max-[760px]:border-r-0">
              <div className="mb-4 px-2 max-[760px]:mb-3">
                <p className="m-0 font-iris-mono text-[9px] uppercase tracking-[0.13em] text-iris-muted">
                  {t("settings.title")}
                </p>
                <h2 className="m-[5px_0_0] font-serif text-[18px] font-medium leading-tight text-iris-strong max-[760px]:hidden">
                  {t("settings.workspaceTone")}
                </h2>
              </div>
              <input
                ref={searchRef}
                className="mb-3 h-8 w-full rounded-lg border border-iris-divider bg-iris-canvas px-2.5 font-iris-mono text-[11px] text-iris-ink outline-none placeholder:text-iris-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color-mix(in_srgb,var(--accent)_48%,transparent)]"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder={t("settings.searchPlaceholder")}
                aria-label={t("settings.search")}
              />
              <nav className="grid gap-1">
                {visibleEntries.map((entry) => {
                  const sectionEntry = entry.kind === "section";
                  const sectionDefinition = sections.find(
                    (item) => item.id === (sectionEntry ? entry.id : entry.scope),
                  );
                  const Icon = sectionDefinition?.icon ?? Settings;
                  const entryId = `${entry.kind}:${entry.id}`;
                  const active = activeEntryId === entryId;
                  return (
                    <button
                      ref={(node) => {
                        if (node) sidebarEntryRefs.current.set(entryId, node);
                        else sidebarEntryRefs.current.delete(entryId);
                      }}
                      className={`flex min-h-8 items-center gap-2 rounded-lg border-0 px-2.5 text-left font-iris-mono text-[11px] transition-[background-color,color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[color-mix(in_srgb,var(--accent)_48%,transparent)] ${sectionEntry ? "" : "pl-7 text-[10px]"} ${active ? "bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent-deep)]" : "bg-transparent text-iris-muted hover:bg-white/35 hover:text-iris-strong"}`}
                      key={entryId}
                      type="button"
                      tabIndex={active ? 0 : -1}
                      aria-current={active ? "page" : undefined}
                      onClick={() => activateEntry(entry, "smooth")}
                      onKeyDown={handleSidebarEntryKeyDown}
                    >
                      <Icon
                        width={sectionEntry ? "14" : "12"}
                        height={sectionEntry ? "14" : "12"}
                      />
                      <span className="truncate">{entry.label}</span>
                    </button>
                  );
                })}
              </nav>
            </aside>

            <div className="flex min-h-0 flex-col rounded-r-[14px] max-[760px]:rounded-r-none max-[760px]:rounded-b-[14px]">
              <div className="flex items-start justify-between gap-4 border-b border-iris-divider px-5 py-4 max-[760px]:px-4">
                <div>
                  <Dialog.Title className="font-serif text-[20px] font-medium leading-tight text-iris-strong">
                    {t(`settings.section.${section}.title`)}
                  </Dialog.Title>
                  <Dialog.Description className="mt-1 font-iris-mono text-[10px] leading-tight text-iris-muted">
                    {t(`settings.section.${section}.description`)}
                  </Dialog.Description>
                </div>
                <Dialog.Close asChild>
                  <IconButton
                    size="1"
                    variant="ghost"
                    color="gray"
                    aria-label={t("settings.close")}
                    title={t("settings.close")}
                  >
                    <X width="15" height="15" />
                  </IconButton>
                </Dialog.Close>
              </div>

              <div
                ref={contentRef}
                className="min-h-0 flex-1 overflow-auto px-5 py-5 max-[760px]:px-4"
                onKeyDownCapture={(event) => {
                  if (event.key !== "Tab") return;
                  const focusables = contentRef.current?.querySelectorAll<HTMLElement>(
                    'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]',
                  );
                  if (!focusables?.length) return;
                  const index = Array.from(focusables).indexOf(event.target as HTMLElement);
                  if (!event.shiftKey && (index === focusables.length - 1 || index < 0)) {
                    event.preventDefault();
                    requestAnimationFrame(() =>
                      sidebarEntryRefs.current.get(activeEntryId)?.focus(),
                    );
                  } else if (event.shiftKey && index <= 0) {
                    event.preventDefault();
                    requestAnimationFrame(() => searchRef.current?.focus());
                  }
                }}
              >
                {section === "workspace" && (
                  <div className="grid gap-4">
                    <SettingSelect
                      settingId="language"
                      label={settingLabel("language")}
                      value={i18n.resolvedLanguage ?? "en"}
                      onChange={(value) => {
                        if (languageOptions.some((option) => option.code === value)) {
                          onLanguageChange(value as LanguageCode);
                        }
                      }}
                    >
                      {languageOptions.map((option) => (
                        <option key={option.code} value={option.code}>
                          {option.label}
                        </option>
                      ))}
                    </SettingSelect>
                    <div data-setting-id="theme">
                      <ThemePicker
                        value={settings.theme}
                        onChange={(value) => onChange("theme", value as ProjectSettings["theme"])}
                      />
                    </div>
                  </div>
                )}

                {section === "editor" && (
                  <div className="grid gap-4">
                    <div data-setting-id="fontFamily">
                      <FontFamilyPicker
                        label={t("settings.fontFamily")}
                        value={settings.fontFamily}
                        theme={settings.theme}
                        onChange={(value) => onChange("fontFamily", value)}
                      />
                    </div>
                    <div data-setting-id="fontSize">
                      <FontSizeSlider
                        label={t("settings.fontSize")}
                        value={settings.fontSize}
                        onChange={(value) => onChange("fontSize", value)}
                      />
                    </div>
                    <SettingSwitch
                      settingId="wordWrap"
                      label={settingLabel("wordWrap")}
                      description={settingDescription("wordWrap")}
                      checked={settings.wordWrap}
                      onCheckedChange={(checked) => onChange("wordWrap", checked)}
                    />
                    <SettingSwitch
                      settingId="relativeLineNumbers"
                      label={settingLabel("relativeLineNumbers")}
                      description={settingDescription("relativeLineNumbers")}
                      checked={settings.relativeLineNumbers}
                      onCheckedChange={(checked) => onChange("relativeLineNumbers", checked)}
                    />
                    <SettingSelect
                      settingId="normalCursorStyle"
                      label={settingLabel("normalCursorStyle")}
                      value={settings.normalCursorStyle}
                      onChange={(value) =>
                        onChange("normalCursorStyle", value as ProjectSettings["normalCursorStyle"])
                      }
                    >
                      <option value="block">{t("settings.cursor.block")}</option>
                      <option value="line">{t("settings.cursor.line")}</option>
                      <option value="underline">{t("settings.cursor.underline")}</option>
                      <option value="block-blink">{t("settings.cursor.blockBlink")}</option>
                      <option value="line-blink">{t("settings.cursor.lineBlink")}</option>
                      <option value="underline-blink">{t("settings.cursor.underlineBlink")}</option>
                    </SettingSelect>
                  </div>
                )}

                {section === "keyboard" && (
                  <div className="grid gap-4">
                    <SettingSwitch
                      settingId="vimMode"
                      label={settingLabel("vimMode")}
                      description={settingDescription("vimMode")}
                      checked={vimMode}
                      onCheckedChange={onVimModeChange}
                    />
                    {KEYMAP_ACTIONS.map((action) => {
                      const labelKey =
                        action === "file.search"
                          ? "settings.fileSearchKeymap"
                          : action === "settings.open"
                            ? "settings.openKeymap"
                            : "settings.commandPaletteKeymap";
                      const binding = keymap.find((item) => item.action === action)?.key ?? "";
                      return (
                        <label
                          key={action}
                          data-setting-id={
                            action === "file.search"
                              ? "fileSearchKeymap"
                              : action === "settings.open"
                                ? "openSettingsKeymap"
                                : "commandPaletteKeymap"
                          }
                          className="grid gap-2 font-iris-mono text-[10px] uppercase tracking-[0.08em] text-iris-muted"
                        >
                          {t(labelKey)}
                          <input
                            className="rounded-lg border border-iris-divider bg-iris-canvas px-3 py-2 font-iris-mono text-xs normal-case tracking-normal text-iris-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color-mix(in_srgb,var(--accent)_36%,transparent)]"
                            value={binding}
                            readOnly
                            onKeyDown={(event) => {
                              if (event.key === "Tab" || event.key === "Escape") return;
                              event.stopPropagation();
                              const key = normalizeKey(event.nativeEvent);
                              if (!key) return;
                              event.preventDefault();
                              onKeymapChange(
                                KEYMAP_ACTIONS.map((item) => ({
                                  action: item,
                                  key:
                                    item === action
                                      ? key
                                      : (keymap.find((candidate) => candidate.action === item)
                                          ?.key ?? ""),
                                })),
                              );
                            }}
                            aria-label={t(labelKey)}
                          />
                        </label>
                      );
                    })}
                  </div>
                )}

                {section === "runtime" && (
                  <div className="grid gap-3">
                    <SettingSelect
                      settingId="packageManager"
                      label={settingLabel("packageManager")}
                      value={settings.packageManager}
                      onChange={(value) => onChange("packageManager", value as PackageManager)}
                    >
                      {packageManagers.map((manager) => (
                        <option key={manager} value={manager}>
                          {manager}
                        </option>
                      ))}
                    </SettingSelect>
                    <SettingSwitch
                      settingId="autoInstall"
                      label={settingLabel("autoInstall")}
                      description={settingDescription("autoInstall")}
                      checked={settings.autoInstall}
                      onCheckedChange={(checked) => onChange("autoInstall", checked)}
                    />
                    <SettingSwitch
                      settingId="autoStartPreview"
                      label={settingLabel("autoStartPreview")}
                      description={settingDescription("autoStartPreview")}
                      checked={settings.autoStartPreview}
                      onCheckedChange={(checked) => onChange("autoStartPreview", checked)}
                    />
                    <div className="mt-2 rounded-lg border border-iris-divider bg-[color-mix(in_srgb,var(--canvas)_72%,transparent)] px-3 py-2.5 font-iris-mono text-[10px] leading-[1.5] text-iris-muted">
                      {t("settings.runtimeNote", { manager: settings.packageManager })}
                    </div>
                    <RuntimeActions t={t} />
                  </div>
                )}
              </div>
            </div>
          </Dialog.Content>
        </Theme>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function RuntimeActions({ t }: { t: (key: string) => string }) {
  const [pending, setPending] = useState<RuntimeAction | undefined>();

  useEffect(() => {
    const handleComplete = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: RuntimeAction }>).detail;
      if (detail.action === pending) setPending(undefined);
    };
    window.addEventListener("iris:runtime-action-complete", handleComplete);
    return () => window.removeEventListener("iris:runtime-action-complete", handleComplete);
  }, [pending]);

  const run = (action: RuntimeAction, button: HTMLButtonElement) => {
    if (pending) return;
    setPending(action);
    dispatchRuntimeAction(action);
    requestAnimationFrame(() => button.focus());
  };

  return (
    <div className="grid gap-2 border-t border-iris-divider pt-3">
      {RUNTIME_ACTIONS.map((action) => (
        <button
          data-setting-id={action.id === "restart" ? "runtimeRestart" : "runtimeReinstall"}
          className="flex min-h-9 items-center justify-center gap-2 rounded-lg border border-iris-divider bg-iris-canvas px-3 py-2 font-iris-mono text-[10px] text-iris-strong transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_8%,var(--canvas))] disabled:cursor-wait disabled:opacity-55"
          key={action.id}
          type="button"
          disabled={Boolean(pending) && pending !== action.id}
          aria-label={t(action.labelKey)}
          title={t(action.labelKey)}
          onClick={(event) => run(action.id, event.currentTarget)}
        >
          <action.icon
            width="13"
            height="13"
            className={pending === action.id ? "animate-spin" : undefined}
          />
          {pending === action.id ? t(action.pendingLabelKey) : t(action.labelKey)}
        </button>
      ))}
    </div>
  );
}

function SettingSelect({
  settingId,
  label,
  value,
  onChange,
  children,
}: {
  settingId?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label
      data-setting-id={settingId}
      className="flex min-w-0 items-center justify-between gap-4 font-iris-mono text-[10px] uppercase tracking-[0.08em] text-iris-muted"
    >
      <span className="shrink-0">{label}</span>
      <span className="relative min-w-0 flex-1">
        <select
          className="w-full appearance-none rounded-lg border border-iris-divider bg-iris-canvas px-3 py-2.5 pr-10 text-base normal-case tracking-normal text-iris-ink outline-none focus-visible:outline-2 focus-visible:outline-[color-mix(in_srgb,var(--accent)_72%,white)] focus-visible:outline-offset-2 min-[760px]:text-xs"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-iris-muted"
          width="14"
          height="14"
        />
      </span>
    </label>
  );
}

function SettingSwitch({
  settingId,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  settingId?: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div
      data-setting-id={settingId}
      className="flex items-center justify-between gap-4 rounded-lg border border-iris-divider bg-[color-mix(in_srgb,var(--canvas)_72%,transparent)] px-3 py-3"
    >
      <div className="min-w-0">
        <p className="m-0 font-iris-mono text-xs text-iris-strong">{label}</p>
        <p className="m-[4px_0_0] font-iris-mono text-[10px] leading-[1.4] text-iris-muted">
          {description}
        </p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  );
}
