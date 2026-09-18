import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { PaletteCommand } from "@/lib/command-palette-model";
import { useCommandPaletteSelectionScroll } from "./use-command-palette-selection-scroll";

type Props = {
  commands: PaletteCommand[];
  selectedIndex: number;
  query: string;
  onSelect: (command: PaletteCommand) => void;
};

export function CommandPaletteResults({ commands, selectedIndex, query, onSelect }: Props) {
  const { t } = useTranslation();
  const { commandListRef, registerCommand } = useCommandPaletteSelectionScroll(
    commands,
    selectedIndex,
  );

  return (
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
                  : "text-[color-mix(in_srgb,var(--muted)_45%,transparent)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
              }`}
              onClick={() => onSelect(command)}
            >
              <Icon size={16} aria-hidden="true" className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                {highlightCommandLabel(command.label, query)}
              </span>
              {command.shortcut ? (
                <span className="shrink-0 font-iris-mono text-[10px] text-[color-mix(in_srgb,var(--muted)_45%,transparent)]">
                  {command.shortcut}
                </span>
              ) : null}
              {command.selected ? (
                <Check size={16} aria-hidden="true" className="shrink-0 text-[var(--accent)]" />
              ) : null}
            </button>
          );
        })
      ) : (
        <p className="px-3 py-8 text-center text-sm text-[var(--muted)]">{t("command.empty")}</p>
      )}
    </div>
  );
}

function highlightCommandLabel(label: string, query: string) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return label;
  const start = label.toLocaleLowerCase().indexOf(normalizedQuery.toLocaleLowerCase());
  if (start < 0) return label;
  const end = start + normalizedQuery.length;
  return (
    <>
      {label.slice(0, start)}
      <mark className="bg-transparent text-[var(--accent-deep)]">{label.slice(start, end)}</mark>
      {label.slice(end)}
    </>
  );
}
