import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EditorLocation } from "../lib/editor-navigation";

export type PeekResult = { title: string; locations: EditorLocation[] };

export function EditorPeek({
  result,
  onClose,
  onNavigate,
}: {
  result: PeekResult;
  onClose: () => void;
  onNavigate: (location: EditorLocation) => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(0);
  const host = useRef<HTMLElement>(null);
  const location = result.locations[selected];
  useEffect(() => {
    host.current?.focus();
  }, []);
  useEffect(() => {
    host.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  const lines = location?.source.split("\n") ?? [];
  const start = Math.max(0, (location?.line ?? 1) - 4);
  const iconButton =
    "grid h-7 w-7 shrink-0 place-items-center rounded text-iris-muted hover:bg-iris-canvas hover:text-iris-ink focus-visible:outline-2 focus-visible:outline-[var(--accent)]";
  return (
    <section
      ref={host}
      tabIndex={-1}
      role="region"
      aria-label={result.title}
      data-editor-peek="true"
      className="flex h-[min(260px,40vh)] min-h-0 shrink-0 flex-col border-t border-[var(--accent)] bg-[var(--editor-surface)] font-iris-mono text-[11px] text-iris-ink outline-none"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="flex h-8 shrink-0 items-center gap-2 border-b border-iris-divider px-3">
        <span className="truncate">{result.title}</span>
        <span className="text-iris-muted">{result.locations.length}</span>
        <span className="flex-1" />
        {location && (
          <button
            type="button"
            className={iconButton}
            title={t("editor.context.openLocation")}
            aria-label={t("editor.context.openLocation")}
            onClick={() => onNavigate(location)}
          >
            <ArrowUpRight size={14} />
          </button>
        )}
        <button
          type="button"
          className={iconButton}
          title={t("editor.context.closePeek")}
          aria-label={t("editor.context.closePeek")}
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </header>
      {location ? (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(100px,35%)_minmax(0,1fr)]">
          <div
            role="listbox"
            aria-label={result.title}
            className="min-w-0 overflow-auto border-r border-iris-divider p-1"
            onKeyDown={(event) => {
              const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
              if (!step) return;
              event.preventDefault();
              const index = (selected + step + result.locations.length) % result.locations.length;
              setSelected(index);
              host.current?.querySelectorAll<HTMLButtonElement>('[role="option"]')[index]?.focus();
            }}
          >
            {result.locations.map((item, index) => (
              <button
                key={`${item.path}:${item.from}`}
                type="button"
                role="option"
                aria-selected={index === selected}
                tabIndex={index === selected ? 0 : -1}
                className={`block w-full truncate rounded px-2 py-1.5 text-left outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] ${selected === index ? "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]" : "text-iris-muted"}`}
                title={`${item.path}:${item.line}:${item.column}`}
                onClick={() => setSelected(index)}
                onDoubleClick={() => onNavigate(item)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onNavigate(item);
                  }
                }}
              >
                {item.path}:{item.line}:{item.column}
              </button>
            ))}
          </div>
          <pre
            className="m-0 min-w-0 overflow-auto py-1.5 leading-5"
            aria-label={t("editor.context.preview")}
          >
            {lines.slice(start, Math.max(start + 8, location.line + 3)).map((line, index) => (
              <div
                key={start + index}
                className={`flex min-w-max pr-3 ${start + index + 1 === location.line ? "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]" : ""}`}
              >
                <span
                  aria-hidden="true"
                  className="sticky left-0 w-10 shrink-0 bg-[var(--editor-surface)] pr-2 text-right text-iris-muted"
                >
                  {start + index + 1}
                </span>
                <code>{line || " "}</code>
              </div>
            ))}
          </pre>
        </div>
      ) : (
        <p role="status" className="px-3 text-iris-muted">
          {t("editor.context.noResults")}
        </p>
      )}
    </section>
  );
}
