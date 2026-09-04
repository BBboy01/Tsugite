import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { PresenceMember } from "@iris/shared";
import { useTranslation } from "react-i18next";

import type { ConnectionStatus } from "../lib/room-client";
import { isPresenceCurrentUser, prioritizeCurrentUser } from "../lib/presence";

type PresenceStackProps = {
  members: PresenceMember[];
  currentUserId: string;
  roomId: string;
  status: ConnectionStatus;
};

export function PresenceStack({ members, currentUserId, roomId, status }: PresenceStackProps) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const statusLabel = t(`status.${status}`);
  const orderedMembers = prioritizeCurrentUser(members, currentUserId);

  return (
    <div className="flex items-center gap-6 max-[1000px]:gap-3">
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 font-iris-mono text-[11px] uppercase tracking-[0.04em] text-iris-muted">
        <span
          className="live-dot inline-block h-[7px] w-[7px] shrink-0 rounded-full"
          data-status={status}
          title={statusLabel}
          aria-label={statusLabel}
        />
        <span className="status-label" data-status={status}>
          {statusLabel}
        </span>
        <span className="max-[760px]:hidden">/</span>
        <span className="max-[760px]:hidden">{roomId}</span>
      </div>
      <div
        className="relative"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={(event) => {
          const nextTarget = event.relatedTarget;
          if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
            setOpen(false);
          }
        }}
      >
        <button
          className="flex cursor-pointer items-center gap-2.5 border-0 bg-transparent p-0 focus-visible:rounded focus-visible:outline-2 focus-visible:outline-[color-mix(in_srgb,var(--accent)_36%,transparent)] focus-visible:outline-offset-4"
          type="button"
          aria-label={t("presence.onlineCount", { count: members.length })}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              event.currentTarget.blur();
            }
          }}
        >
          <span className="flex items-center gap-2 whitespace-nowrap font-iris-mono text-[11px] leading-tight tracking-[0.04em] text-iris-muted max-[1000px]:hidden">
            {t("presence.onlineCount", { count: members.length })}
          </span>
          <div className="flex pl-2">
            <AnimatePresence initial={false}>
              {orderedMembers.slice(0, 6).map((member) => (
                <motion.span
                  className="-ml-[7px] grid h-[26px] w-[26px] place-items-center rounded-full border-2 border-iris-canvas font-iris-mono text-[9px] leading-none text-white shadow-[0_1px_3px_rgba(38,49,41,0.14)]"
                  style={{ background: member.color }}
                  title={member.displayName}
                  key={member.userId}
                  layout
                  initial={{ opacity: 0, scale: 0.7, x: 6 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.7, x: -6 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                >
                  {getInitials(member.displayName)}
                </motion.span>
              ))}
            </AnimatePresence>
          </div>
        </button>
        {open && (
          <div className="absolute right-0 top-full z-10 pt-2">
            <div className="glass-popover glass-presence-popover w-[190px] rounded-[10px] border border-iris-divider bg-iris-preview p-2">
              <div className="mb-0 flex items-center justify-between border-b border-iris-divider px-1 pb-2 pt-0.5 font-iris-mono text-[9px] uppercase leading-tight tracking-[0.1em] text-iris-muted">
                <span>{t("presence.collaborators")}</span>
                <span>{members.length}</span>
              </div>
              <div className="grid gap-px pt-1.5">
                {orderedMembers.map((member) => {
                  const isCurrentUser = isPresenceCurrentUser(member.userId, currentUserId);
                  return (
                    <div
                      className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1"
                      key={member.userId}
                    >
                      <span
                        className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border border-iris-canvas font-iris-mono text-[8px] leading-none text-white"
                        style={{ background: member.color }}
                      >
                        {getInitials(member.displayName)}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-iris-mono text-[10px] leading-tight text-iris-ink">
                        {member.displayName}
                      </span>
                      {isCurrentUser && (
                        <span className="font-iris-mono text-[8px] uppercase leading-tight text-[var(--accent-deep)]">
                          {t("presence.you")}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function ConnectionIcon({ status }: { status: ConnectionStatus }) {
  return (
    <span
      className="live-dot inline-block h-[7px] w-[7px] rounded-full"
      data-status={status}
      aria-label={status}
    />
  );
}
