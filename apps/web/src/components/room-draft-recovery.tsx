import * as Dialog from "@radix-ui/react-dialog";
import { RotateCcw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { WorkspaceTheme } from "@iris/shared";
import type { DraftState, RoomDrafts } from "../lib/room-drafts";

export function RoomDraftRecovery({
  state,
  session,
  theme,
  onClose,
}: {
  state: DraftState;
  session: RoomDrafts;
  theme: WorkspaceTheme;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const draft = state.available[0];
  const buttonClass =
    "inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-iris-divider px-3 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-accent disabled:opacity-50";
  return (
    <Dialog.Root open={Boolean(draft)}>
      <Dialog.Portal>
        <Dialog.Overlay className="glass-overlay fixed inset-0 z-[60]" />
        <Dialog.Content
          role="alertdialog"
          data-draft-recovery
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            onClose();
          }}
          className={`theme-${theme} glass-dialog fixed left-1/2 top-1/2 z-[60] w-[min(92vw,460px)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-iris-divider bg-iris-preview p-5 text-iris-ink shadow-xl focus:outline-none`}
        >
          <Dialog.Title className="m-0 text-base font-medium text-iris-strong">
            {t("drafts.title")}
          </Dialog.Title>
          <Dialog.Description className="mt-3 text-sm leading-6 text-iris-muted">
            {t(state.applied ? "drafts.applied" : "drafts.description")}
          </Dialog.Description>
          {draft && Number.isFinite(draft.updatedAt) && (
            <p className="mt-3 font-iris-mono text-xs text-iris-muted">
              {new Date(draft.updatedAt).toLocaleString(i18n.language)}
            </p>
          )}
          {state.error && (
            <p role="alert" className="mt-3 text-sm text-iris-strong">
              {t(`drafts.${state.error}Error`)}
            </p>
          )}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={state.busy}
              className={`${buttonClass} bg-iris-canvas text-iris-strong`}
              onClick={() => {
                void session.restore();
              }}
            >
              <RotateCcw size={14} aria-hidden="true" />
              {t(state.applied ? "drafts.retry" : "drafts.restore")}
            </button>
            <button
              type="button"
              disabled={state.busy || state.applied}
              className={buttonClass}
              onClick={() => {
                void session.discard();
              }}
            >
              <Trash2 size={14} aria-hidden="true" />
              {t("drafts.discard")}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
