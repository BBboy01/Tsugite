import * as Dialog from "@radix-ui/react-dialog";
import { Settings, X } from "lucide-react";
import { IconButton, Theme } from "@radix-ui/themes";
import { motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { isDarkWorkspaceTheme } from "../lib/workspace-theme";
import { SettingsContent } from "./settings-content";
import type { SettingsDialogProps } from "./settings-types";

import { useSettingsNavigation } from "./use-settings-navigation";

export const SETTINGS_DIALOG_THEME_CLASS_NAME = "settings-dialog-theme";

function highlightSearchText(text: string, query: string): ReactNode {
  const value = query.trim();
  if (!value) return text;
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return parts.map((part, index) =>
    part.toLocaleLowerCase() === value.toLocaleLowerCase() ? (
      <mark key={`${part}-${index}`} className="bg-transparent text-[var(--accent-deep)]">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

export function SettingsPopover({
  settings,
  onChange,
  vimMode,
  onVimModeChange,
  keymap,
  onKeymapChange,
  onLanguageChange,
}: SettingsDialogProps) {
  const { t } = useTranslation();
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
  const {
    section,
    query,
    setQuery,
    activeEntryId,
    searchRef,
    sidebarEntryRefs,
    contentRef,
    sections,
    visibleEntries,
    activateEntry,
    handleSidebarEntryKeyDown,
    handleSearchKeyDown,
  } = useSettingsNavigation();

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
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              requestAnimationFrame(() => sidebarEntryRefs.current.get(activeEntryId)?.focus());
            }}
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
                      className={`flex min-h-8 w-full min-w-0 items-center gap-2 overflow-hidden rounded-lg border-0 px-2.5 text-left font-iris-mono text-[11px] transition-[background-color,color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[color-mix(in_srgb,var(--accent)_48%,transparent)] ${sectionEntry ? "" : "pl-7 text-[10px]"} ${active ? "bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent-deep)]" : "bg-transparent text-iris-muted hover:bg-white/35 hover:text-iris-strong"}`}
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
                      <span className="min-w-0 whitespace-normal break-words">
                        {highlightSearchText(entry.label, query)}
                      </span>
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
                    'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), [tabindex="0"]',
                  );
                  if (!focusables?.length) return;
                  const index = Array.from(focusables).indexOf(event.target as HTMLElement);
                  if (!event.shiftKey && index >= 0 && index < focusables.length - 1) {
                    const next = focusables[index + 1];
                    event.preventDefault();
                    requestAnimationFrame(() => next.focus());
                  } else if (!event.shiftKey && (index === focusables.length - 1 || index < 0)) {
                    event.preventDefault();
                    requestAnimationFrame(() =>
                      sidebarEntryRefs.current.get(activeEntryId)?.focus(),
                    );
                  } else if (event.shiftKey) {
                    const previous = focusables[index - 1];
                    event.preventDefault();
                    requestAnimationFrame(() => (previous ?? searchRef.current)?.focus());
                  }
                }}
              >
                <SettingsContent
                  section={section}
                  {...{
                    settings,
                    onChange,
                    vimMode,
                    onVimModeChange,
                    keymap,
                    onKeymapChange,
                    onLanguageChange,
                  }}
                />
              </div>
            </div>
          </Dialog.Content>
        </Theme>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
