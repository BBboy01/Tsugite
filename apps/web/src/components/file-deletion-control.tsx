import { Undo2, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { WorkspaceTheme } from "@iris/shared";
import type { FileDeletionRecovery } from "../lib/file-deletion-recovery";

type FileDeletionControlProps = {
  recovery?: FileDeletionRecovery;
  theme: WorkspaceTheme;
  onClose: () => void;
};

export function FileDeletionControl({ recovery, theme, onClose }: FileDeletionControlProps) {
  const { t } = useTranslation();
  const [conflict, setConflict] = useState<FileDeletionRecovery>();
  const buttonClass =
    "inline-flex min-h-8 items-center justify-center gap-2 rounded-md border border-iris-divider px-3 font-iris-mono text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-accent";

  return recovery
    ? createPortal(
        <div
          className={`theme-${theme} fixed bottom-4 left-1/2 z-40 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-lg border border-iris-divider bg-iris-preview px-3 py-2 text-iris-ink shadow-lg`}
        >
          <p role="status" className="min-w-0 break-words text-xs">
            {conflict === recovery
              ? t("files.restoreConflict")
              : t("files.deleted", { path: recovery.path })}
          </p>
          <button
            type="button"
            className={`${buttonClass} shrink-0`}
            onClick={() => {
              if (recovery.undo()) {
                onClose();
                setConflict(undefined);
              } else setConflict(recovery);
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
            onClick={onClose}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>,
        document.body,
      )
    : null;
}
