import * as Dialog from "@radix-ui/react-dialog";
import { FileCode2 } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ProjectFile, WorkspaceTheme } from "@iris/shared";

import { fuzzyMatchFiles, fuzzyMatchIndexes } from "../lib/file-fuzzy-search";

type Props = {
  open: boolean;
  files: readonly ProjectFile[];
  theme: WorkspaceTheme;
  onOpenChange: (open: boolean) => void;
  onSelect: (path: string) => void;
};

export function FileFuzzySearchDialog({ open, files, theme, onOpenChange, onSelect }: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const matches = useMemo(() => (open ? fuzzyMatchFiles(files, query) : []), [files, open, query]);
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);
  useEffect(() => {
    setSelected((value) => Math.min(value, Math.max(0, matches.length - 1)));
  }, [matches.length]);
  useLayoutEffect(() => {
    selectedRef.current?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "instant",
    });
  }, [matches, selected]);
  const moveSelection = (offset: number) => {
    if (!matches.length) return;
    setSelected((value) => (value + offset + matches.length) % matches.length);
  };
  const choose = () => {
    const file = matches[selected];
    if (file) {
      onSelect(file.path);
      onOpenChange(false);
    }
  };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay data-dialog-overlay className="fixed inset-0 z-50 bg-black/30" />
        <Dialog.Content
          onEscapeKeyDown={(event) => event.preventDefault()}
          onKeyDownCapture={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            onOpenChange(false);
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
          }}
          className={`theme-${theme} fixed left-1/2 top-[18%] z-50 w-[min(92vw,560px)] -translate-x-1/2 rounded-xl border border-iris-divider bg-iris-preview text-iris-ink shadow-[0_20px_50px_rgba(65,66,45,0.2)] focus:outline-none`}
        >
          <div className="flex items-center gap-3 border-b border-iris-divider px-4 py-3">
            <FileCode2 width="16" height="16" className="text-[var(--accent)]" />
            <Dialog.Title className="sr-only">{t("files.searchTitle")}</Dialog.Title>
            <input
              ref={inputRef}
              role="combobox"
              aria-label={t("files.searchTitle")}
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={matches[selected] ? `${listId}-${selected}` : undefined}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelected(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  moveSelection(1);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  moveSelection(-1);
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  choose();
                } else if (event.ctrlKey && (event.key === "n" || event.key === "p")) {
                  event.preventDefault();
                  moveSelection(event.key === "n" ? 1 : -1);
                }
              }}
              placeholder={t("files.searchPlaceholder")}
              className="min-w-0 flex-1 border-0 bg-transparent font-iris-mono text-sm text-iris-ink outline-none placeholder:text-[color-mix(in_srgb,var(--muted)_45%,transparent)]"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div
            id={listId}
            role="listbox"
            aria-label={t("files.searchTitle")}
            className="max-h-[min(52vh,360px)] overflow-auto p-2"
          >
            {matches.map((file, index) => (
              <button
                key={file.id}
                id={`${listId}-${index}`}
                ref={index === selected ? selectedRef : undefined}
                type="button"
                role="option"
                aria-selected={index === selected}
                tabIndex={-1}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left font-iris-mono text-[11px] ${index === selected ? "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-iris-strong" : "text-[color-mix(in_srgb,var(--muted)_45%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]"}`}
                onMouseEnter={() => setSelected(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect(file.path);
                  onOpenChange(false);
                }}
              >
                <FileCode2 width="14" height="14" className="shrink-0 text-[var(--accent)]" />
                <span className="truncate">
                  {renderHighlightedPath(file.path, query, index === selected)}
                </span>
              </button>
            ))}
            {matches.length === 0 && (
              <p className="m-0 px-3 py-5 text-center font-iris-mono text-[11px] text-iris-muted">
                {t("files.searchEmpty")}
              </p>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function renderHighlightedPath(path: string, query: string, isSelected: boolean) {
  const separator = path.lastIndexOf("/");
  const directory = separator >= 0 ? path.slice(0, separator + 1) : "";
  const fileName = path.slice(separator + 1);
  const textClassName = isSelected
    ? "text-iris-strong"
    : "text-[color-mix(in_srgb,var(--muted)_45%,transparent)]";
  return (
    <>
      <span data-file-directory className={textClassName}>
        {directory}
      </span>
      <span data-file-name className={textClassName}>
        {renderHighlightedText(
          fileName,
          fuzzyMatchIndexes(path, query)
            .filter((index) => index > separator)
            .map((index) => index - separator - 1),
        )}
      </span>
    </>
  );
}

function renderHighlightedText(text: string, matches: number[]) {
  const indexes = new Set(matches);
  const segments: Array<{ text: string; highlighted: boolean }> = [];
  let index = 0;
  for (const character of text) {
    const highlighted = indexes.has(index);
    const previous = segments.at(-1);
    if (previous?.highlighted === highlighted) previous.text += character;
    else segments.push({ text: character, highlighted });
    index += character.length;
  }
  return segments.map((segment, segmentIndex) =>
    segment.highlighted ? (
      <mark
        className="bg-transparent text-[var(--accent-deep)]"
        key={`${segmentIndex}-${segment.text}`}
      >
        {segment.text}
      </mark>
    ) : (
      <span key={`${segmentIndex}-${segment.text}`}>{segment.text}</span>
    ),
  );
}
