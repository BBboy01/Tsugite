import { DoubleArrowLeftIcon, DoubleArrowRightIcon } from "@radix-ui/react-icons";
import { motion } from "motion/react";
import type { ReactNode } from "react";

import type { WorkspacePanelId } from "../lib/workspace-layout-model";

type WorkspacePanelFrameProps = {
  panel: WorkspacePanelId;
  collapseLabel: string;
  onCollapse?: () => void;
  children: ReactNode;
};

export function WorkspacePanelFrame({
  panel,
  collapseLabel,
  onCollapse,
  children,
}: WorkspacePanelFrameProps) {
  const surfaceClass =
    panel === "files" ? "bg-iris-rail" : panel === "preview" ? "bg-iris-preview" : "bg-iris-editor";

  return (
    <div
      className={`group/panel relative flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden ${surfaceClass}`}
    >
      {onCollapse ? (
        <div className="pointer-events-none absolute right-1 top-px z-30 opacity-0 transition-opacity duration-150 group-hover/panel:pointer-events-auto group-hover/panel:opacity-100 group-focus-within/panel:pointer-events-auto group-focus-within/panel:opacity-100 max-[760px]:hidden">
          <motion.button
            className="grid h-4 w-4 place-items-center rounded-[4px] border border-[color-mix(in_srgb,var(--accent)_28%,var(--divider))] bg-[color-mix(in_srgb,var(--accent)_10%,var(--glass-popover))] text-[var(--accent)] shadow-[0_1px_2px_color-mix(in_srgb,var(--ink-strong)_10%,transparent)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_18%,var(--glass-popover))] hover:text-[var(--accent-deep)] focus-visible:bg-[color-mix(in_srgb,var(--accent)_18%,var(--glass-popover))] focus-visible:text-[var(--accent-deep)] focus-visible:outline-none"
            type="button"
            aria-label={collapseLabel}
            title={collapseLabel}
            onClick={onCollapse}
            whileTap={{ scale: 0.9 }}
          >
            <DoubleArrowLeftIcon width="10" height="10" />
          </motion.button>
        </div>
      ) : null}
      <div className="min-h-0 min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function CollapsedFilesButton({ label, onExpand }: { label: string; onExpand: () => void }) {
  return (
    <motion.button
      className="absolute left-1 top-1 z-50 grid h-5 w-5 place-items-center rounded-[4px] border border-[color-mix(in_srgb,var(--accent)_28%,var(--divider))] bg-[color-mix(in_srgb,var(--accent)_12%,var(--glass-popover))] text-[var(--accent)] shadow-[0_1px_3px_color-mix(in_srgb,var(--ink-strong)_14%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,var(--glass-popover))] hover:text-[var(--accent-deep)] focus-visible:bg-[color-mix(in_srgb,var(--accent)_20%,var(--glass-popover))] focus-visible:text-[var(--accent-deep)] focus-visible:outline-none"
      type="button"
      aria-label={label}
      title={label}
      onClick={onExpand}
      whileTap={{ scale: 0.9 }}
    >
      <DoubleArrowRightIcon width="11" height="11" />
    </motion.button>
  );
}
