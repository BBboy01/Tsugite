import { ArrowLeft, Command } from "lucide-react";
import type { RefObject, KeyboardEvent } from "react";

import type { PaletteCommand } from "../lib/command-palette-model";

type CommandPaletteSearchProps = {
  inputRef: RefObject<HTMLInputElement | null>;
  query: string;
  placeholder: string;
  backLabel?: string;
  commands: PaletteCommand[];
  selectedIndex: number;
  onQueryChange: (value: string) => void;
  onBack?: () => void;
  onActivate: (command: PaletteCommand) => void;
  onMoveSelection: (offset: number) => void;
};

export function CommandPaletteSearch({
  inputRef,
  query,
  placeholder,
  backLabel,
  commands,
  selectedIndex,
  onQueryChange,
  onBack,
  onActivate,
  onMoveSelection,
}: CommandPaletteSearchProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      const command = commands[selectedIndex];
      if (command) onActivate(command);
      return;
    }

    const offset =
      event.key === "ArrowDown" || ((event.ctrlKey || event.metaKey) && event.key === "n")
        ? 1
        : event.key === "ArrowUp" || ((event.ctrlKey || event.metaKey) && event.key === "p")
          ? -1
          : 0;
    if (offset !== 0) {
      event.preventDefault();
      onMoveSelection(offset);
    }
  };

  return (
    <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2.5">
      {onBack ? (
        <button
          type="button"
          aria-label={backLabel}
          title={backLabel}
          className="grid size-7 shrink-0 place-items-center text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
          onClick={onBack}
        >
          <ArrowLeft size={16} aria-hidden="true" />
        </button>
      ) : (
        <Command size={16} aria-hidden="true" className="shrink-0 text-[var(--muted)]" />
      )}
      <input
        ref={inputRef}
        aria-label={placeholder}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--text-secondary)] max-[760px]:text-base"
      />
    </div>
  );
}
