import * as ContextMenu from "@radix-ui/react-context-menu";
import { Copy, FilePlus2, Pencil, Plus, Trash2 } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectFile, WorkspaceTheme } from "@iris/shared";
import type { InlineEditMode } from "../lib/file-tree-edit-model";
import type { FileTreeTarget } from "../lib/file-tree-model";
import type { FileTreeDeleteTarget } from "./file-tree.types";

type Props = {
  theme: WorkspaceTheme;
  target: FileTreeTarget;
  onStartEdit: (mode: InlineEditMode, target: FileTreeTarget) => void;
  onCopy: (file: ProjectFile) => void;
  onRequestDelete: (target: FileTreeDeleteTarget) => void;
  onCloseAutoFocus: (event: Event) => void;
};

const itemClassName =
  "flex cursor-default select-none items-center gap-2 rounded-md px-2 py-2 outline-none data-[highlighted]:bg-[color-mix(in_srgb,var(--accent)_13%,transparent)] data-[highlighted]:text-iris-strong data-[disabled]:pointer-events-none data-[disabled]:opacity-45";

export function FileTreeContextMenu({
  theme,
  target,
  onStartEdit,
  onCopy,
  onRequestDelete,
  onCloseAutoFocus,
}: Props) {
  const { t } = useTranslation();
  const deleteItemRef = useRef<HTMLDivElement>(null);

  return (
    <ContextMenu.Portal>
      <ContextMenu.Content
        onCloseAutoFocus={onCloseAutoFocus}
        className={`theme-${theme} glass-popover z-40 min-w-[190px] rounded-[9px] border border-iris-divider bg-iris-preview p-1.5 font-iris-mono text-[11px] leading-[1.2] text-iris-ink shadow-[0_14px_30px_rgba(65,66,45,0.16)]`}
      >
        <ContextMenu.Item
          className={itemClassName}
          onSelect={() => onStartEdit("create-file", target)}
        >
          <FilePlus2 width="14" height="14" />
          {t("files.newFile")}
        </ContextMenu.Item>
        <ContextMenu.Item
          className={itemClassName}
          onSelect={() => onStartEdit("create-folder", target)}
        >
          <Plus width="14" height="14" />
          {t("files.newFolder")}
        </ContextMenu.Item>
        <ContextMenu.Separator className="my-1 mx-1 h-px bg-iris-divider" />
        <ContextMenu.Item
          className={itemClassName}
          disabled={!target}
          onSelect={() =>
            target && onStartEdit(target.type === "file" ? "rename-file" : "rename-folder", target)
          }
        >
          <Pencil width="14" height="14" />
          {t("files.rename")}
        </ContextMenu.Item>
        <ContextMenu.Item
          className={itemClassName}
          disabled={target?.type !== "file"}
          onSelect={() => target?.type === "file" && onCopy(target.file)}
        >
          <Copy width="14" height="14" />
          {t("files.copy")}
        </ContextMenu.Item>
        <ContextMenu.Item
          ref={deleteItemRef}
          className="flex cursor-default select-none items-center gap-2 rounded-md px-2 py-2 text-[#a55f5f] outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-45 data-[highlighted]:bg-[rgba(165,95,95,0.1)]"
          disabled={!target}
          onSelect={() => {
            const anchorRect = deleteItemRef.current?.getBoundingClientRect();
            if (target && anchorRect) onRequestDelete({ ...target, anchorRect });
          }}
        >
          <Trash2 width="14" height="14" />
          {t("files.delete")}
        </ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu.Portal>
  );
}
