import { ColumnsIcon, LayoutIcon } from "@radix-ui/react-icons";
import { IconButton } from "@radix-ui/themes";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";

import type { PresenceMember } from "@iris/shared";
import type { ConnectionStatus } from "../lib/room-client";

import { PresenceStack } from "./presence-stack";

type GlobalHeaderProps = {
  currentUserId: string;
  roomId: string;
  members: PresenceMember[];
  status: ConnectionStatus;
  followingUserId: string | null;
  onFollowMember: (userId: string) => void;
  onOpenFiles: () => void;
  onOpenPreview: () => void;
};

export const GLOBAL_HEADER_CLASS_NAME =
  "glass-header relative z-50 flex h-12 min-w-0 items-center gap-[22px] bg-iris-canvas px-[18px] max-[760px]:h-11 max-[760px]:px-2.5";

export function GlobalHeader({
  currentUserId,
  roomId,
  members,
  status,
  followingUserId,
  onFollowMember,
  onOpenFiles,
  onOpenPreview,
}: GlobalHeaderProps) {
  const { t } = useTranslation();

  return (
    <motion.header
      className={GLOBAL_HEADER_CLASS_NAME}
      initial={{ y: -8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
    >
      <IconButton asChild variant="ghost" color="gray" radius="medium">
        <motion.button
          className="mobile-panel-trigger hidden h-9 w-9 shrink-0 place-items-center rounded-[9px] border border-iris-divider bg-transparent text-iris-muted hover:bg-white/42 hover:text-iris-strong focus-visible:bg-white/42 focus-visible:text-iris-strong focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[color-mix(in_srgb,var(--accent)_48%,transparent)] max-[760px]:grid"
          type="button"
          onClick={onOpenFiles}
          aria-label={t("header.toggleFiles")}
          title={t("header.toggleFiles")}
          whileTap={{ scale: 0.96 }}
        >
          <ColumnsIcon width="17" height="17" />
        </motion.button>
      </IconButton>

      <div className="flex min-w-0 shrink-0 items-center gap-2.5 max-[760px]:gap-2">
        <img
          className="h-8 w-8 shrink-0 rounded-[9px]"
          src="/tsugite-mark.svg"
          alt=""
          aria-hidden="true"
        />
        <div className="flex min-w-0 flex-col justify-center leading-none">
          <h1 className="m-0 font-sans text-[17px] font-semibold text-iris-strong">
            {t("app.name")}
          </h1>
          <span className="mt-1 font-iris-mono text-[9px] leading-none tracking-[0.08em] text-iris-muted">
            {t("app.version")}
          </span>
        </div>
      </div>

      <div className="relative flex min-w-0 flex-1 items-center justify-end gap-[18px] max-[760px]:justify-center">
        <PresenceStack
          currentUserId={currentUserId}
          members={members}
          roomId={roomId}
          status={status}
          followingUserId={followingUserId}
          onFollowMember={onFollowMember}
        />
      </div>

      <IconButton asChild variant="ghost" color="gray" radius="medium">
        <motion.button
          className="mobile-panel-trigger hidden h-9 w-9 shrink-0 place-items-center rounded-[9px] border border-iris-divider bg-transparent text-iris-muted hover:bg-white/42 hover:text-iris-strong focus-visible:bg-white/42 focus-visible:text-iris-strong focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[color-mix(in_srgb,var(--accent)_48%,transparent)] max-[760px]:grid"
          type="button"
          onClick={onOpenPreview}
          aria-label={t("header.togglePreview")}
          title={t("header.togglePreview")}
          whileTap={{ scale: 0.96 }}
        >
          <LayoutIcon width="17" height="17" />
        </motion.button>
      </IconButton>
    </motion.header>
  );
}
