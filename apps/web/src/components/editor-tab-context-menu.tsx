import * as ContextMenu from "@radix-ui/react-context-menu";
import { ArrowRightToLine, Copy, ListX, X } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { WorkspaceTheme } from "@iris/shared";
import type { EditorTabCloseMode } from "../lib/editor-tabs";

type Props = {
  children: ReactNode;
  theme: WorkspaceTheme;
  canCloseOthers: boolean;
  canCloseRight: boolean;
  onClose: () => void;
  onCloseTabs: (mode: EditorTabCloseMode) => void;
  onCopyPath: () => void;
};

const itemClass =
  "flex cursor-default select-none items-center gap-2 rounded px-2 py-1.5 outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-[var(--selection-surface)]";

export function EditorTabContextMenu({
  children,
  theme,
  canCloseOthers,
  canCloseRight,
  onClose,
  onCloseTabs,
  onCopyPath,
}: Props) {
  const { t } = useTranslation();
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className={`theme-${theme} glass-popover z-40 min-w-[190px] rounded-lg border border-iris-divider bg-iris-preview p-1.5 font-iris-mono text-[11px] leading-[1.2] text-iris-ink shadow-[0_14px_30px_rgba(65,66,45,0.16)]`}
        >
          <ContextMenu.Item className={itemClass} onSelect={onClose}>
            <X width="14" height="14" />
            {t("editor.tabs.close")}
          </ContextMenu.Item>
          <ContextMenu.Item
            className={itemClass}
            disabled={!canCloseOthers}
            onSelect={() => onCloseTabs("others")}
          >
            <ListX width="14" height="14" />
            {t("editor.tabs.closeOthers")}
          </ContextMenu.Item>
          <ContextMenu.Item
            className={itemClass}
            disabled={!canCloseRight}
            onSelect={() => onCloseTabs("right")}
          >
            <ArrowRightToLine width="14" height="14" />
            {t("editor.tabs.closeRight")}
          </ContextMenu.Item>
          <ContextMenu.Item className={itemClass} onSelect={() => onCloseTabs("all")}>
            <ListX width="14" height="14" />
            {t("editor.tabs.closeAll")}
          </ContextMenu.Item>
          <ContextMenu.Separator className="mx-1 my-1 h-px bg-iris-divider" />
          <ContextMenu.Item className={itemClass} onSelect={onCopyPath}>
            <Copy width="14" height="14" />
            {t("editor.tabs.copyPath")}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
