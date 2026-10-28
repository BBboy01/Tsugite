import { X } from "lucide-react";
import { Reorder, useDragControls, useReducedMotion } from "motion/react";
import { useRef, type FocusEventHandler } from "react";
import { useTranslation } from "react-i18next";
import type { WorkspaceTheme } from "@iris/shared";
import type { EditorTabViewModel } from "../lib/editor-tab-model";
import type { EditorTabCloseMode } from "../lib/editor-tabs";
import { FileTypeIcon } from "../lib/file-icon";
import { EditorTabContextMenu } from "./editor-tab-context-menu";

type Props = {
  tab: EditorTabViewModel;
  theme: WorkspaceTheme;
  tabStop: boolean;
  canCloseOthers: boolean;
  canCloseRight: boolean;
  onFocus: () => void;
  onBlur: FocusEventHandler<HTMLButtonElement>;
  onSelect: () => void;
  onClose: () => void;
  onCloseTabs: (mode: EditorTabCloseMode) => void;
  onCopyPath: () => void;
  onMove: (direction: number) => void;
};

export function EditorFileTab({
  tab: { file, label, active, collaboratorCount },
  theme,
  tabStop,
  canCloseOthers,
  canCloseRight,
  onFocus,
  onBlur,
  onSelect,
  onClose,
  onCloseTabs,
  onCopyPath,
  onMove,
}: Props) {
  const { t } = useTranslation();
  const controls = useDragControls();
  const reducedMotion = useReducedMotion();
  const dragged = useRef(false);
  const itemRef = useRef<HTMLDivElement>(null);

  return (
    <EditorTabContextMenu
      theme={theme}
      canCloseOthers={canCloseOthers}
      canCloseRight={canCloseRight}
      onClose={onClose}
      onCloseTabs={onCloseTabs}
      onCopyPath={onCopyPath}
    >
      <Reorder.Item
        ref={itemRef}
        as="div"
        value={file.path}
        dragListener={false}
        dragControls={controls}
        dragMomentum={false}
        dragElastic={0}
        transition={reducedMotion ? { duration: 0 } : undefined}
        onDragStart={() => {
          dragged.current = true;
        }}
        onDrag={(_event, info) => {
          const scroller = itemRef.current?.closest('[role="tablist"]');
          if (!scroller) return;
          const bounds = scroller.getBoundingClientRect();
          if (info.point.x < bounds.left + 32) scroller.scrollLeft -= 16;
          else if (info.point.x > bounds.right - 32) scroller.scrollLeft += 16;
        }}
        className={`group relative flex h-[30px] shrink-0 items-center rounded-lg font-iris-mono text-[10px] leading-none transition-[background-color] duration-150 ease-out ${active ? "bg-[color-mix(in_srgb,var(--accent)_18%,var(--editor-surface))] text-iris-ink shadow-[0_1px_2px_rgba(75,67,45,0.06)]" : "text-[var(--text-dimmed)] hover:bg-[color-mix(in_srgb,var(--accent)_14%,var(--editor-surface))] hover:text-iris-ink"}`}
      >
        <button
          className="flex h-full min-w-0 max-w-[min(32vw,220px)] touch-pan-y select-none items-center gap-2 overflow-hidden rounded-l-lg border-0 bg-transparent px-2.5 text-left text-inherit transition-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--focus-ring)] max-[760px]:max-w-[180px] max-[760px]:px-2"
          type="button"
          role="tab"
          aria-selected={active}
          aria-keyshortcuts="Alt+Shift+ArrowLeft Alt+Shift+ArrowRight"
          tabIndex={tabStop ? 0 : -1}
          onFocus={onFocus}
          onBlur={onBlur}
          aria-label={
            collaboratorCount > 0
              ? `${file.path}, ${t("editor.collaboratorsInFile", { count: collaboratorCount })}`
              : file.path
          }
          title={file.path}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            dragged.current = false;
            controls.start(event);
          }}
          onKeyDown={(event) => {
            if (
              !event.altKey ||
              !event.shiftKey ||
              !["ArrowLeft", "ArrowRight"].includes(event.key)
            )
              return;
            event.preventDefault();
            event.stopPropagation();
            onMove(event.key === "ArrowLeft" ? -1 : 1);
          }}
          onClick={() => {
            if (!dragged.current) onSelect();
          }}
        >
          <FileTypeIcon
            path={file.path}
            className="shrink-0 text-[var(--accent)]"
            width="12"
            height="12"
          />
          <span className={`truncate ${active ? "text-[var(--accent-deep)]" : ""}`}>{label}</span>
          {collaboratorCount > 0 && (
            <span
              className="grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] px-1 font-iris-mono text-[9px] leading-none text-[var(--accent-deep)]"
              data-collaborator-badge={file.path}
              title={t("editor.collaboratorsInFile", { count: collaboratorCount })}
              aria-hidden="true"
            >
              +{collaboratorCount}
            </span>
          )}
        </button>
        <button
          className="mr-1 grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md border-0 bg-transparent text-[var(--text-dimmed)] opacity-0 transition-none group-hover:opacity-100 focus-visible:opacity-100 hover:text-iris-strong focus-visible:text-iris-strong focus-visible:outline-2 focus-visible:outline-[var(--focus-ring-subtle)]"
          type="button"
          aria-label={t("editor.closeFile", { path: file.path })}
          title={t("editor.closeFile", { path: file.path })}
          onClick={onClose}
        >
          <X width="13" height="13" />
        </button>
      </Reorder.Item>
    </EditorTabContextMenu>
  );
}
