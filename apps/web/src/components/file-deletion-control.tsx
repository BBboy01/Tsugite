import * as Dialog from "@radix-ui/react-dialog";
import { Trash2, Undo2, X } from "lucide-react";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { ProjectFile, WorkspaceTheme } from "@iris/shared";
import type { FileDeletionRecovery } from "../lib/file-deletion-recovery";
import type { FileTreeTarget } from "./file-tree";

type FileDeletionControlProps = {
  target: FileTreeTarget;
  files: ProjectFile[];
  theme: WorkspaceTheme;
  onClose: () => void;
  onDelete: (target: Exclude<FileTreeTarget, null>) => FileDeletionRecovery | undefined;
};

export function FileDeletionControl({
  target,
  files,
  theme,
  onClose,
  onDelete,
}: FileDeletionControlProps) {
  const { t } = useTranslation();
  const [recovery, setRecovery] = useState<FileDeletionRecovery>();
  const [conflict, setConflict] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const path = target?.type === "file" ? target.file.path : (target?.path ?? "");
  const count = files.filter((file) => file.path.startsWith(`${path}/`)).length;
  const buttonClass =
    "inline-flex min-h-8 items-center justify-center gap-2 rounded-md border border-iris-divider px-3 font-iris-mono text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-accent";

  return (
    <>
      <Dialog.Root
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="glass-overlay fixed inset-0 z-50" />
          <Dialog.Content
            role="alertdialog"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              cancelRef.current?.focus();
            }}
            className={`theme-${theme} glass-dialog fixed left-1/2 top-1/2 z-50 w-[min(92vw,460px)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-iris-divider bg-iris-preview p-5 text-iris-ink shadow-xl focus:outline-none`}
          >
            <Dialog.Title className="flex items-center gap-2 text-base font-medium text-iris-strong">
              <Trash2 size={16} aria-hidden="true" />
              {t(target?.type === "folder" ? "files.deleteFolderTitle" : "files.deleteFileTitle")}
            </Dialog.Title>
            <Dialog.Description className="mt-3 break-words text-sm text-iris-muted">
              {t(
                target?.type === "folder"
                  ? "files.deleteFolderDescription"
                  : "files.deleteFileDescription",
                { path, count },
              )}
            </Dialog.Description>
            <div className="mt-5 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button ref={cancelRef} type="button" className={buttonClass}>
                  {t("dialog.cancel")}
                </button>
              </Dialog.Close>
              <button
                type="button"
                className={`${buttonClass} text-[#a55f5f]`}
                onClick={() => {
                  if (!target) return;
                  const result = onDelete(target);
                  if (result) {
                    setRecovery(result);
                    setConflict(false);
                  }
                  onClose();
                }}
              >
                <Trash2 size={14} aria-hidden="true" />
                {t("files.delete")}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {recovery &&
        createPortal(
          <div
            className={`theme-${theme} fixed bottom-4 left-1/2 z-40 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-lg border border-iris-divider bg-iris-preview px-3 py-2 text-iris-ink shadow-lg`}
          >
            <p role="status" className="min-w-0 break-words text-xs">
              {conflict ? t("files.restoreConflict") : t("files.deleted", { path: recovery.path })}
            </p>
            <button
              type="button"
              className={`${buttonClass} shrink-0`}
              onClick={() => {
                if (recovery.undo()) {
                  setRecovery(undefined);
                  setConflict(false);
                } else setConflict(true);
              }}
            >
              <Undo2 size={14} aria-hidden="true" />
              {t("files.undoDeletion")}
            </button>
            <button
              type="button"
              className="grid size-8 shrink-0 place-items-center rounded-md focus-visible:outline-2 focus-visible:outline-iris-accent"
              aria-label={t("files.dismissRecovery")}
              title={t("files.dismissRecovery")}
              onClick={() => setRecovery(undefined)}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
