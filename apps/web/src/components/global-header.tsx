import { Columns3, PanelLeftClose, PanelLeftOpen, PanelsTopLeft } from "lucide-react";
import { IconButton } from "@radix-ui/themes";
import { motion } from "motion/react";
import { type CSSProperties } from "react";
import { useTranslation } from "react-i18next";

import type { PresenceMember } from "@iris/shared";
import type { ConnectionStatus } from "../lib/room-client";
import type { DraftState } from "../lib/room-drafts";
import { useFilesBreakpoint } from "../lib/use-files-breakpoint";

import { PresenceStack } from "./presence-stack";

type GlobalHeaderProps = {
  currentUserId: string;
  roomId: string;
  members: PresenceMember[];
  status: ConnectionStatus;
  syncError?: string;
  hasPendingChanges?: boolean;
  draftBackup?: DraftState["backup"];
  followingUserId: string | null;
  filesCollapsed: boolean;
  filesWidth: number;
  mobileFilesOpen: boolean;
  onFollowMember: (userId: string) => void;
  onToggleDesktopFiles: () => void;
  onToggleMobileFiles: () => void;
  onOpenPreview: () => void;
};

export const GLOBAL_HEADER_CLASS_NAME =
  "glass-header relative z-50 flex h-12 min-w-0 items-center bg-iris-canvas max-[760px]:h-11";

export function GlobalHeader({
  currentUserId,
  roomId,
  members,
  status,
  syncError,
  hasPendingChanges,
  draftBackup,
  followingUserId,
  filesCollapsed,
  filesWidth,
  mobileFilesOpen,
  onFollowMember,
  onToggleDesktopFiles,
  onToggleMobileFiles,
  onOpenPreview,
}: GlobalHeaderProps) {
  const { t } = useTranslation();
  const isNarrowScreen = useFilesBreakpoint();
  const filesOpen = isNarrowScreen ? mobileFilesOpen : !filesCollapsed;
  const filesToggleLabel = isNarrowScreen
    ? t(mobileFilesOpen ? "header.closeFiles" : "header.openFiles")
    : t(filesCollapsed ? "header.expandFiles" : "header.collapseFiles");

  return (
    <motion.header
      className={GLOBAL_HEADER_CLASS_NAME}
      initial={{ y: -8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
    >
      <div
        data-header-files-region
        data-files-collapsed={filesCollapsed}
        className="relative isolate flex h-full shrink-0 items-center justify-between gap-2.5 border-r border-transparent px-[18px] w-[var(--header-files-width)] max-[760px]:w-auto max-[760px]:gap-2 max-[760px]:px-2.5"
        style={{ "--header-files-width": `${filesWidth}px` } as CSSProperties}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5 max-[760px]:gap-2">
          <img
            className="h-8 w-8 shrink-0 rounded-[9px]"
            src="/tsugite-mark.svg"
            alt=""
            aria-hidden="true"
          />
          <div className="flex min-w-0 flex-col justify-center leading-none">
            <h1 className="m-0 truncate font-sans text-[17px] font-semibold text-iris-strong">
              {t("app.name")}
            </h1>
            <span className="mt-1 whitespace-nowrap font-iris-mono text-[9px] leading-none tracking-[0.08em] text-iris-muted">
              {t("app.version")}
            </span>
          </div>
        </div>

        <IconButton asChild variant="ghost" color="gray" radius="medium">
          <motion.button
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-[9px] transition-colors duration-150 motion-reduce:transition-none hover:bg-[var(--hover-surface)] hover:text-iris-strong focus-visible:bg-[var(--hover-surface)] focus-visible:text-iris-strong focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)] ${filesOpen ? "text-iris-strong" : "text-iris-muted"}`}
            type="button"
            onClick={isNarrowScreen ? onToggleMobileFiles : onToggleDesktopFiles}
            aria-label={filesToggleLabel}
            aria-expanded={filesOpen}
            aria-controls="workspace-files-panel"
            whileTap={{ scale: 0.96 }}
          >
            {isNarrowScreen ? (
              <Columns3 width="17" height="17" />
            ) : filesCollapsed ? (
              <PanelLeftOpen width="17" height="17" />
            ) : (
              <PanelLeftClose width="17" height="17" />
            )}
          </motion.button>
        </IconButton>
      </div>

      <div className="relative flex min-w-0 flex-1 items-center justify-end gap-[18px] px-[18px] max-[760px]:justify-center max-[760px]:gap-2.5 max-[760px]:px-2.5">
        <PresenceStack
          currentUserId={currentUserId}
          members={members}
          roomId={roomId}
          status={status}
          syncError={syncError}
          hasPendingChanges={hasPendingChanges}
          draftBackup={draftBackup}
          followingUserId={followingUserId}
          onFollowMember={onFollowMember}
        />
      </div>

      <IconButton asChild variant="ghost" color="gray" radius="medium">
        <motion.button
          className="mobile-panel-trigger mr-[18px] hidden h-9 w-9 shrink-0 place-items-center rounded-[9px] border border-iris-divider bg-transparent text-iris-muted hover:bg-[var(--hover-surface)] hover:text-iris-strong focus-visible:bg-[var(--hover-surface)] focus-visible:text-iris-strong focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)] max-[760px]:mr-2.5 max-[760px]:grid"
          type="button"
          onClick={onOpenPreview}
          aria-label={t("header.togglePreview")}
          title={t("header.togglePreview")}
          whileTap={{ scale: 0.96 }}
        >
          <PanelsTopLeft width="17" height="17" />
        </motion.button>
      </IconButton>
    </motion.header>
  );
}
