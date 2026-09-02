import { ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { IconButton } from "@radix-ui/themes";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { useRef, type KeyboardEvent, type PointerEvent } from "react";

type PanelResizeHandleProps = {
  panel: "files" | "preview";
  collapsed: boolean;
  value: number;
  min: number;
  max: number;
  onResize: (delta: number) => void;
  onToggle: () => void;
};

export function PanelResizeHandle({
  panel,
  collapsed,
  value,
  min,
  max,
  onResize,
  onToggle,
}: PanelResizeHandleProps) {
  const { t } = useTranslation();
  const lastClientX = useRef<number | undefined>(undefined);
  const label = panel === "files" ? t("resize.files") : t("resize.preview");

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    lastClientX.current = event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (lastClientX.current === undefined) return;
    const rawDelta = event.clientX - lastClientX.current;
    const delta = panel === "files" ? rawDelta : -rawDelta;
    if (delta === 0) return;
    lastClientX.current = event.clientX;
    onResize(delta);
  };

  const stopDragging = (event: PointerEvent<HTMLDivElement>) => {
    if (lastClientX.current === undefined) return;
    lastClientX.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onToggle();
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    onResize(panel === "files" ? direction * 24 : direction * -24);
  };

  const CollapseIcon =
    panel === "files"
      ? collapsed
        ? ChevronRightIcon
        : ChevronLeftIcon
      : collapsed
        ? ChevronLeftIcon
        : ChevronRightIcon;

  return (
    <div
      className="group relative z-20 flex w-2 cursor-col-resize touch-none select-none items-center justify-center bg-transparent hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-iris-accent max-[760px]:hidden"
      role="separator"
      tabIndex={0}
      aria-label={`Resize ${label}`}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={collapsed ? 0 : value}
      aria-valuetext={collapsed ? "collapsed" : `${value}px`}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
      onDoubleClick={onToggle}
    >
      <span className="h-full w-px bg-iris-divider" aria-hidden="true" />
      <IconButton asChild variant="ghost" color="gray" radius="small">
        <motion.button
          type="button"
          className={`absolute grid h-6 w-6 place-items-center rounded-md border border-iris-divider bg-iris-canvas text-iris-muted shadow-[0_1px_3px_rgba(65,66,45,0.12)] hover:text-iris-strong focus-visible:outline-2 focus-visible:outline-iris-accent ${collapsed ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
          aria-label={t(collapsed ? "resize.expand" : "resize.collapse", { panel: label })}
          title={t(collapsed ? "resize.expand" : "resize.collapse", { panel: label })}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onToggle}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
        >
          <CollapseIcon width="14" height="14" />
        </motion.button>
      </IconButton>
    </div>
  );
}
