import { ChevronDownIcon, ChevronUpIcon, TrashIcon } from "@radix-ui/react-icons";
import { Select } from "@radix-ui/themes";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";

import type { PreviewOutput } from "../lib/preview-runner";
import {
  DEFAULT_PREVIEW_CONSOLE_HEIGHT,
  filterPreviewOutputs,
  getPreviewConsoleMaxHeight,
  MIN_PREVIEW_CONSOLE_HEIGHT,
  type PreviewOutputFilter,
  resizePreviewConsoleHeight,
} from "../lib/preview-console-model";

type PreviewConsoleProps = {
  outputs: PreviewOutput[];
  onClear: () => void;
  getPreviewHeight: () => number;
};

export function PreviewConsole({ outputs, onClear, getPreviewHeight }: PreviewConsoleProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(true);
  const [height, setHeight] = useState(DEFAULT_PREVIEW_CONSOLE_HEIGHT);
  const [filter, setFilter] = useState<PreviewOutputFilter>("all");
  const dragRef = useRef<{ clientY: number; height: number } | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const visibleOutputs = useMemo(() => filterPreviewOutputs(outputs, filter), [outputs, filter]);

  useEffect(() => {
    if (collapsed || !outputRef.current) return;
    outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [collapsed, visibleOutputs]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || collapsed) return;
    dragRef.current = { clientY: event.clientY, height };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    setHeight(
      resizePreviewConsoleHeight(
        dragRef.current.height,
        event.clientY - dragRef.current.clientY,
        getPreviewHeight(),
      ),
    );
  };

  const stopDragging = (event: PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const delta = event.key === "ArrowUp" ? -16 : 16;
    setHeight((current) => resizePreviewConsoleHeight(current, delta, getPreviewHeight()));
  };

  return (
    <section
      className="glass-console relative flex flex-none flex-col overflow-hidden rounded-b-[10px] bg-[color-mix(in_srgb,var(--preview-surface)_94%,var(--ink))]"
      style={{ height: collapsed ? 24 : height }}
      aria-label={t("preview.output")}
    >
      {!collapsed ? (
        <div
          className="group absolute inset-x-0 top-0 z-10 h-2 -translate-y-1/2 touch-none cursor-row-resize outline-none"
          role="separator"
          tabIndex={0}
          aria-label={t("preview.console.resize")}
          aria-orientation="horizontal"
          aria-valuemin={MIN_PREVIEW_CONSOLE_HEIGHT}
          aria-valuemax={Math.round(getPreviewConsoleMaxHeight(getPreviewHeight()))}
          aria-valuenow={Math.round(height)}
          onKeyDown={handleKeyDown}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
        >
          <span className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-iris-accent opacity-0 shadow-[0_0_8px_color-mix(in_srgb,var(--accent)_60%,transparent)] transition-opacity duration-150 group-hover:opacity-70 group-focus-visible:opacity-70 group-active:opacity-100" />
        </div>
      ) : null}

      <div className="flex h-6 flex-none items-center justify-between px-2 font-iris-mono text-[9px] leading-none text-iris-muted">
        <button
          className="flex h-full items-center gap-1 bg-transparent p-0 text-inherit hover:text-iris-strong focus-visible:text-iris-strong focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[color-mix(in_srgb,var(--accent)_48%,transparent)]"
          type="button"
          aria-expanded={!collapsed}
          aria-label={t(collapsed ? "preview.console.expand" : "preview.console.collapse")}
          onClick={() => setCollapsed((current) => !current)}
        >
          {collapsed ? (
            <ChevronUpIcon width="10" height="10" />
          ) : (
            <ChevronDownIcon width="10" height="10" />
          )}
          <span>{t("preview.output")}</span>
        </button>
        <div className="flex items-center gap-1">
          <Select.Root
            value={filter}
            onValueChange={(value) => setFilter(value as PreviewOutputFilter)}
            size="1"
          >
            <Select.Trigger
              aria-label={t("preview.filter")}
              className="h-5 min-w-[74px] border-0 bg-transparent px-1 text-[9px] text-iris-muted shadow-none hover:text-iris-strong"
              radius="small"
              variant="ghost"
            />
            <Select.Content position="popper">
              <Select.Item value="all">{t("preview.filterAll")}</Select.Item>
              <Select.Item value="log">{t("preview.filterLog")}</Select.Item>
              <Select.Item value="warn">{t("preview.filterWarn")}</Select.Item>
              <Select.Item value="error">{t("preview.filterError")}</Select.Item>
            </Select.Content>
          </Select.Root>
          {outputs.length > 0 ? (
            <button
              className="grid h-6 w-6 place-items-center rounded-[3px] border-0 bg-transparent p-0 text-iris-muted transition-colors hover:bg-[color-mix(in_srgb,var(--preview-surface)_82%,var(--ink))] hover:text-iris-strong focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[color-mix(in_srgb,var(--accent)_48%,transparent)]"
              type="button"
              aria-label={t("preview.clearOutput")}
              title={t("preview.clearOutput")}
              onClick={onClear}
            >
              <TrashIcon width="10" height="10" />
            </button>
          ) : null}
        </div>
      </div>

      {!collapsed ? (
        <div
          className="min-h-0 flex-1 overflow-auto px-2 pb-2 font-iris-mono text-[10px] leading-[1.45] text-iris-ink"
          ref={outputRef}
        >
          {visibleOutputs.length > 0 ? (
            visibleOutputs.map((output, index) => (
              <div
                className={
                  output.level === "error"
                    ? "break-words text-[#b7645d]"
                    : output.level === "warn"
                      ? "break-words text-[#a8793f]"
                      : "break-words"
                }
                key={`${output.message}-${index}`}
              >
                {output.message}
              </div>
            ))
          ) : (
            <p className="m-0 text-iris-muted">
              {t(outputs.length > 0 ? "preview.filterEmpty" : "preview.outputEmpty")}
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
