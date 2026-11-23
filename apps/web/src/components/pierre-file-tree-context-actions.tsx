import type { ContextMenuItem, ContextMenuOpenContext } from "@pierre/trees";
import type { ProjectSettings } from "@iris/shared";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { createPortal } from "react-dom";

export function PierreFileTreeContextActions({
  item,
  context,
  theme,
  labels,
  onAction,
}: {
  item: ContextMenuItem | null;
  context: Pick<
    ContextMenuOpenContext,
    "anchorRect" | "close" | "restoreFocus"
  >;
  theme: ProjectSettings["theme"];
  labels: Record<string, string>;
  onAction: (action: string, anchorRect?: DOMRect) => void;
}) {
  const selectAction =
    (action: string) =>
    (event: Event): void => {
      event.preventDefault();
      onAction(
        action,
        (event.currentTarget as HTMLElement).getBoundingClientRect(),
      );
    };
  const trigger = (
    <DropdownMenu.Trigger asChild>
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        style={{
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: "none",
          border: 0,
          padding: 0,
          position: "fixed",
          left: context.anchorRect.left,
          top: context.anchorRect.bottom - 1,
        }}
      />
    </DropdownMenu.Trigger>
  );

  return (
    <DropdownMenu.Root
      open
      modal={false}
      onOpenChange={(open) => {
        if (!open) context.close();
      }}
    >
      {typeof document === "undefined"
        ? trigger
        : createPortal(trigger, document.body)}
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          data-file-tree-context-menu-root="true"
          aria-label={item ? `${item.name} actions` : "File tree actions"}
          align="start"
          side="bottom"
          sideOffset={
            context.anchorRect.width === 0 && context.anchorRect.height === 0
              ? 0
              : 4
          }
          collisionPadding={8}
          style={{
            backgroundColor: "var(--preview-surface)",
            maxHeight: "calc(100vh - 16px)",
            overflowY: "auto",
          }}
          className={`theme-${theme} z-50 min-w-32 space-y-px overflow-hidden overscroll-contain rounded-lg border border-iris-divider bg-clip-padding p-1 font-sans text-sm leading-5 text-iris-ink shadow-lg motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=open]:zoom-in-95 motion-safe:data-[state=closed]:zoom-out-95 motion-safe:data-[side=bottom]:slide-in-from-top-2 motion-safe:data-[side=top]:slide-in-from-bottom-2`}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            // A new menu can mount before this deferred close callback runs.
            const nextMenu = document.querySelector(
              '[data-file-tree-context-menu-root][data-state="open"]',
            );
            if (nextMenu && nextMenu !== event.target) return;
            context.restoreFocus();
          }}
        >
          <DropdownMenu.Item
            className={contextMenuItemClass}
            onSelect={selectAction("new-file")}
          >
            {labels.newFile}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={contextMenuItemClass}
            onSelect={selectAction("new-folder")}
          >
            {labels.newFolder}
          </DropdownMenu.Item>
          {item && (
            <>
              <DropdownMenu.Item
                className={contextMenuItemClass}
                disabled={item.path === "package.json"}
                onSelect={selectAction("rename")}
              >
                {labels.rename}
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="-mx-1 my-1 h-px bg-iris-divider" />
              <DropdownMenu.Item
                className={`${contextMenuItemClass} data-[highlighted]:bg-[color-mix(in_srgb,currentColor_15%,transparent)]`}
                style={{ color: "color-mix(in srgb, #ef4444 75%, var(--ink))" }}
                onSelect={selectAction("delete")}
              >
                {labels.delete}
              </DropdownMenu.Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

const contextMenuItemClass =
  "relative flex cursor-default select-none items-center rounded-md px-3 py-1.5 text-sm leading-5 outline-none focus:bg-[var(--selection-surface)] focus:text-iris-strong data-[disabled]:pointer-events-none data-[disabled]:opacity-50";
