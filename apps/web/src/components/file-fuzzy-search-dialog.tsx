import * as Dialog from "@radix-ui/react-dialog";
import { FileCode2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
        <Dialog.Overlay className="glass-overlay fixed inset-0 z-50" />
        <Dialog.Content
          className={`theme-${theme} glass-dialog fixed left-1/2 top-[18%] z-50 w-[min(92vw,560px)] -translate-x-1/2 rounded-xl border border-iris-divider bg-iris-preview text-iris-ink shadow-[0_20px_50px_rgba(65,66,45,0.2)] focus:outline-none`}
        >
          <div className="flex items-center gap-3 border-b border-iris-divider px-4 py-3">
            <FileCode2 width="16" height="16" className="text-[var(--accent)]" />
            <Dialog.Title className="sr-only">{t("files.searchTitle")}</Dialog.Title>
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelected(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setSelected((value) => Math.min(value + 1, matches.length - 1));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setSelected((value) => Math.max(value - 1, 0));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  choose();
                } else if (event.ctrlKey && (event.key === "j" || event.key === "k")) {
                  event.preventDefault();
                  setSelected((value) =>
                    event.key === "j"
                      ? Math.min(value + 1, matches.length - 1)
                      : Math.max(value - 1, 0),
                  );
                }
              }}
              placeholder={t("files.searchPlaceholder")}
              className="min-w-0 flex-1 border-0 bg-transparent font-iris-mono text-sm text-iris-ink outline-none placeholder:text-iris-muted"
              autoComplete="off"
              spellCheck={false}
            />
            <Dialog.Close asChild>
              <button
                type="button"
                className="grid h-6 w-6 place-items-center rounded-md border-0 bg-transparent text-iris-muted hover:text-iris-strong"
                aria-label={t("dialog.close")}
              >
                <X width="14" height="14" />
              </button>
            </Dialog.Close>
          </div>
          <div className="max-h-[min(52vh,360px)] overflow-auto p-2">
            {matches.map((file, index) => (
              <button
                key={file.id}
                type="button"
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left font-iris-mono text-[11px] ${index === selected ? "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-iris-strong" : "text-iris-muted hover:bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]"}`}
                onMouseEnter={() => setSelected(index)}
                onClick={() => {
                  onSelect(file.path);
                  onOpenChange(false);
                }}
              >
                <FileCode2 width="14" height="14" className="shrink-0 text-[var(--accent)]" />
                <span className="truncate">{renderHighlightedPath(file.path, query)}</span>
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

function renderHighlightedPath(path: string, query: string) {
  const indexes = new Set(fuzzyMatchIndexes(path, query));
  const segments: Array<{ text: string; highlighted: boolean }> = [];
  [...path].forEach((character, index) => {
    const highlighted = indexes.has(index);
    const previous = segments.at(-1);
    if (previous?.highlighted === highlighted) previous.text += character;
    else segments.push({ text: character, highlighted });
  });
  return segments.map((segment, index) =>
    segment.highlighted ? (
      <mark
        className="rounded-[2px] bg-[color-mix(in_srgb,var(--accent)_28%,transparent)] px-px text-[var(--accent-deep)]"
        key={`${index}-${segment.text}`}
      >
        {segment.text}
      </mark>
    ) : (
      <span key={`${index}-${segment.text}`}>{segment.text}</span>
    ),
  );
}
