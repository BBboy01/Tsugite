import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Code2, Keyboard, Palette, Rocket } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getSettingsByScope } from "../lib/settings-registry";
import type { SettingsSection, NavigationEntry } from "./settings-types";
const sectionScopes: SettingsSection[] = ["workspace", "editor", "keyboard", "runtime"];

export function useSettingsNavigation() {
  const { t } = useTranslation();
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
          matched.some((match) => match.kind === "setting" && match.id === entry.id)),
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

  return {
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
  };
}
