import { Trash2 } from "lucide-react";
import { useId, useLayoutEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Popover } from "@radix-ui/themes";
import type { ProjectSettings } from "@iris/shared";

import type { FileTreeNode } from "../lib/file-tree-model";

export function InlineTreeInput({
  value,
  error,
  onChange,
  onSubmit,
  onCancel,
}: {
  value: string;
  error?: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.select();
  }, []);
  return (
    <div className="relative flex min-w-0 flex-1 flex-col gap-1">
      <input
        ref={inputRef}
        id="file-tree-path"
        aria-label={t("dialog.path")}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
          if (event.key === "Enter") {
            event.preventDefault();
            onSubmit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        onBlur={onSubmit}
        aria-invalid={Boolean(error)}
        className="min-w-0 flex-1 rounded border border-[color-mix(in_srgb,var(--accent)_42%,var(--divider))] bg-[var(--canvas)] px-2 py-1 font-iris-mono text-[10px] text-iris-strong outline-2 outline-offset-1 outline-[color-mix(in_srgb,var(--accent)_32%,transparent)]"
        autoComplete="off"
        spellCheck={false}
      />
      {error && <span className="text-[9px] leading-tight text-[#b7645d]">{error}</span>}
    </div>
  );
}

export function DeletePopover({
  theme,
  anchorRect,
  path,
  count,
  isFolder,
  onConfirm,
  onCancel,
}: {
  theme: ProjectSettings["theme"];
  anchorRect: DOMRect;
  path: string;
  count: number;
  isFolder: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const anchorRef = useMemo(
    () => ({ current: { getBoundingClientRect: () => anchorRect } }),
    [anchorRect],
  );
  const cancelRef = useRef<HTMLButtonElement>(null);
  const descriptionId = useId();
  return (
    <Popover.Root
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <Popover.Anchor virtualRef={anchorRef} />
      <Popover.Content
        size="1"
        side="bottom"
        align="start"
        sideOffset={6}
        collisionPadding={8}
        width="min(16rem, calc(100vw - 16px))"
        maxHeight="var(--radix-popover-content-available-height)"
        style={{ backgroundColor: "var(--preview-surface)" }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelRef.current?.focus({ preventScroll: true });
        }}
        role="alertdialog"
        aria-label={t("files.delete")}
        aria-describedby={descriptionId}
        className={`theme-${theme} z-50 rounded-lg border border-iris-divider text-iris-ink shadow-[0_12px_30px_rgba(38,49,41,0.2)] outline-none`}
      >
        <p
          id={descriptionId}
          className="m-0 break-words font-iris-mono text-[10px] leading-tight text-iris-muted"
        >
          {t(isFolder ? "files.deleteFolderDescription" : "files.deleteFileDescription", {
            path,
            count,
          })}
        </p>
        <div className="mt-2 flex justify-end gap-1.5">
          <button
            ref={cancelRef}
            type="button"
            className="rounded border border-iris-divider px-2 py-1 font-iris-mono text-[10px] text-iris-muted focus-visible:outline-2 focus-visible:outline-iris-accent"
            onClick={onCancel}
          >
            {t("dialog.cancel")}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded border border-[#a55f5f]/40 px-2 py-1 font-iris-mono text-[10px] text-[#a55f5f] focus-visible:outline-2 focus-visible:outline-[#a55f5f]"
            onClick={onConfirm}
          >
            <Trash2 size={11} aria-hidden="true" />
            {t("files.delete")}
          </button>
        </div>
      </Popover.Content>
    </Popover.Root>
  );
}

export function countFiles(nodes: FileTreeNode[]): number {
  return nodes.reduce(
    (count, node) => count + (node.kind === "file" ? 1 : countFiles(node.children)),
    0,
  );
}
