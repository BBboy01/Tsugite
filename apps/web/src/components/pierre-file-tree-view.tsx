import { FileTree as PierreFileTree } from "@pierre/trees/react";
import type { CSSProperties } from "react";
import type { FileTreeTarget } from "../lib/file-tree-model";
import { DeletePopover } from "./file-tree-inline-controls";
import { PierreFileTreeContextActions } from "./pierre-file-tree-context-actions";
import { PierreFileTreeToolbar } from "./pierre-file-tree-toolbar";
import {
  usePierreFileTreeController,
  type PierreFileTreeProps,
} from "./use-pierre-file-tree-controller";

export function PierreFileTreeView(props: PierreFileTreeProps) {
  const {
    wrapperRef,
    model,
    theme,
    t,
    callbacks,
    startingRenameRef,
    startDraftCreation,
    searchOpen,
    setDeleteError,
    setDeletePrompt,
    rootContext,
    actionError,
    deletePrompt,
    deleteError,
    deletePath,
    deleteCount,
  } = usePierreFileTreeController(props);
  return (
    <>
      <div ref={wrapperRef} className="flex min-h-0 flex-1 flex-col">
        <PierreFileTree
          model={model}
          header={
            <PierreFileTreeToolbar
              label={props.label}
              title={t("panel.files")}
              searchOpen={searchOpen}
              onSearch={() => (model.isSearchOpen() ? model.closeSearch() : model.openSearch())}
              onCreate={(action) => startDraftCreation(action, "")}
              newFileLabel={t("files.newFile")}
              newFolderLabel={t("files.newFolder")}
            />
          }
          renderContextMenu={(item, context) => (
            <PierreFileTreeContextActions
              item={item}
              context={context}
              theme={theme}
              labels={{
                newFile: t("files.newFile"),
                newFolder: t("files.newFolder"),
                rename: t("files.rename"),
                delete: t("files.delete"),
              }}
              onAction={(action, actionAnchorRect) => {
                const path = item?.path.replace(/\/$/, "") ?? "";
                const isFile = item?.kind === "file";
                const file = callbacks.current.files.find((candidate) => candidate.path === path);
                const target: FileTreeTarget = isFile
                  ? file
                    ? { type: "file", file }
                    : null
                  : { type: "folder", path };
                if (action === "new-file" || action === "new-folder") {
                  const parent = !item
                    ? ""
                    : item.kind === "directory"
                      ? path
                      : path.split("/").slice(0, -1).join("/");
                  context.close({ restoreFocus: false });
                  setTimeout(() => startDraftCreation(action, parent), 0);
                } else if (action === "rename" && target) {
                  context.close({ restoreFocus: false });
                  setTimeout(() => {
                    startingRenameRef.current = true;
                    try {
                      model.startRenaming(item.path);
                    } finally {
                      startingRenameRef.current = false;
                    }
                  }, 0);
                } else if (action === "delete" && target) {
                  const request = {
                    target,
                    anchorRect: actionAnchorRect ?? (context.anchorRect as DOMRect),
                  };
                  setDeleteError(undefined);
                  setDeletePrompt(request);
                  context.close({ restoreFocus: false });
                }
              }}
            />
          )}
          aria-label="Project files"
          role="group"
          style={
            {
              minHeight: 0,
              flex: 1,
              height: "100%",
              width: "100%",
              colorScheme: theme.includes("dark") ? "dark" : "light",
              "--trees-accent-override": "var(--accent)",
              "--trees-bg-override": "transparent",
              "--trees-bg-muted-override": "var(--hover-surface)",
              "--trees-border-color-override": "var(--divider)",
              "--trees-fg-override": "var(--muted)",
              "--trees-fg-muted-override": "var(--muted)",
              "--trees-focus-ring-color-override": "var(--accent)",
              "--trees-font-family-override": "var(--mono-font)",
              "--trees-search-bg-override": "var(--canvas)",
              "--trees-search-fg-override": "var(--ink)",
              "--trees-selected-bg-override": "var(--selection-surface)",
              "--trees-selected-fg-override": "var(--ink-strong)",
            } as CSSProperties
          }
        />
        {rootContext && (
          <PierreFileTreeContextActions
            item={null}
            context={rootContext}
            theme={theme}
            labels={{
              newFile: t("files.newFile"),
              newFolder: t("files.newFolder"),
              rename: t("files.rename"),
              delete: t("files.delete"),
            }}
            onAction={(action) => {
              if (action === "new-file" || action === "new-folder") {
                rootContext.close({ restoreFocus: false });
                setTimeout(() => startDraftCreation(action, ""), 0);
              }
            }}
          />
        )}
        {actionError && (
          <div role="alert" className="mx-2 mb-2 text-xs text-[#a55f5f]">
            {actionError}
          </div>
        )}
      </div>
      {deletePrompt && (
        <DeletePopover
          theme={theme}
          anchorRect={deletePrompt.anchorRect}
          path={deletePath}
          count={deleteCount}
          isFolder={deletePrompt.target.type === "folder"}
          error={deleteError}
          onCancel={() => {
            setDeletePrompt(null);
            setDeleteError(undefined);
          }}
          onConfirm={() => {
            try {
              callbacks.current.onDelete(deletePrompt.target);
              setDeletePrompt(null);
              setDeleteError(undefined);
            } catch (error) {
              setDeleteError(error instanceof Error ? error.message : t("files.deleteFailed"));
            }
          }}
        />
      )}
    </>
  );
}
