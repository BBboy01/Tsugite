import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import {
  constrainWorkspacePanelWidths,
  DEFAULT_WORKSPACE_PANEL_WIDTHS,
  readWorkspacePanelWidths,
  type WorkspacePanelId,
  type WorkspacePanelWidths,
  type WorkspaceResizeSide,
} from "../lib/workspace-layout-model";
import { CollapsedFilesButton, WorkspacePanelFrame } from "./workspace-panel-frame";

type WorkspaceLayoutProps = {
  files: ReactNode;
  editor: ReactNode;
  preview: ReactNode;
};

const STORAGE_KEY = "iris.workspace-panels.v2";
const LEGACY_STORAGE_KEY = "iris.workspace-layout.v1";
const KEYBOARD_RESIZE_STEP = 16;

export function WorkspaceLayout({ files, editor, preview }: WorkspaceLayoutProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const [containerWidth, setContainerWidth] = useState(1280);
  const [filesCollapsed, setFilesCollapsed] = useState(false);
  const [preferredWidths, setPreferredWidths] = useState<WorkspacePanelWidths>(readStoredWidths);
  const panelNodes = useMemo(
    () => ({ files, editor, preview }) satisfies Record<WorkspacePanelId, ReactNode>,
    [editor, files, preview],
  );
  const desktop = containerWidth > 760;
  const showCollapsedFilesButton = desktop && filesCollapsed;
  const filesShown = !filesCollapsed;
  const resizableWidth = containerWidth;
  const visibleSides = {
    files: filesShown,
    preview: true,
  };
  const panelWidths = constrainWorkspacePanelWidths(preferredWidths, resizableWidth, visibleSides);
  const desktopColumns = buildDesktopColumns({
    filesShown,
    widths: panelWidths,
  });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => resizeCleanupRef.current?.(), []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferredWidths));
  }, [preferredWidths]);

  useEffect(() => {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  }, []);

  const updateWidth = (side: WorkspaceResizeSide, nextValue: number) => {
    const nextWidths = constrainWorkspacePanelWidths(
      { ...panelWidths, [side]: nextValue },
      resizableWidth,
      visibleSides,
      side,
    );
    setPreferredWidths(nextWidths);
  };

  const startResize = (side: WorkspaceResizeSide, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    resizeCleanupRef.current?.();
    const startX = event.clientX;
    const startWidths = panelWidths;

    const handlePointerMove = (pointerEvent: PointerEvent) => {
      const delta = pointerEvent.clientX - startX;
      const nextValue = side === "files" ? startWidths.files + delta : startWidths.preview - delta;
      updateWidth(side, nextValue);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", cleanup);
      window.removeEventListener("pointercancel", cleanup);
      window.removeEventListener("blur", cleanup);
      resizeCleanupRef.current = null;
    };

    resizeCleanupRef.current = cleanup;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", cleanup);
    window.addEventListener("pointercancel", cleanup);
    window.addEventListener("blur", cleanup);
  };

  const handleResizeKeyDown = (
    side: WorkspaceResizeSide,
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const delta = side === "files" ? direction : -direction;
    updateWidth(side, panelWidths[side] + delta * KEYBOARD_RESIZE_STEP);
  };

  const renderPanel = (panel: WorkspacePanelId, collapsible = false) => (
    <WorkspacePanelFrame
      panel={panel}
      onCollapse={collapsible ? () => setFilesCollapsed(true) : undefined}
      collapseLabel={t("panel.collapseFiles")}
    >
      {panelNodes[panel]}
    </WorkspacePanelFrame>
  );

  return (
    <div ref={containerRef} className="workspace-layout h-full min-h-0 min-w-0 overflow-hidden">
      {desktop ? (
        <div
          className="relative grid h-full min-h-0 min-w-0 overflow-hidden"
          style={{ gridTemplateColumns: desktopColumns }}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {filesShown ? (
              <motion.div
                key="files"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
                data-panel="files"
                className="min-h-0 min-w-0 overflow-hidden"
              >
                {renderPanel("files", true)}
              </motion.div>
            ) : null}
          </AnimatePresence>
          <div data-panel="editor" className="relative min-h-0 min-w-0 overflow-hidden">
            {renderPanel("editor")}
            {showCollapsedFilesButton ? (
              <CollapsedFilesButton
                label={t("panel.expandFiles")}
                onExpand={() => setFilesCollapsed(false)}
              />
            ) : null}
          </div>
          <div data-panel="preview" className="min-h-0 min-w-0 overflow-hidden">
            {renderPanel("preview")}
          </div>
          {visibleSides.files ? (
            <ResizeHandle
              side="files"
              offset={panelWidths.files}
              value={panelWidths.files}
              max={resizableWidth}
              label={t("panel.resizeFiles")}
              onPointerDown={(event) => startResize("files", event)}
              onKeyDown={(event) => handleResizeKeyDown("files", event)}
              onReset={() => updateWidth("files", DEFAULT_WORKSPACE_PANEL_WIDTHS.files)}
            />
          ) : null}
          <ResizeHandle
            side="preview"
            offset={panelWidths.preview}
            value={panelWidths.preview}
            max={resizableWidth}
            label={t("panel.resizePreview")}
            onPointerDown={(event) => startResize("preview", event)}
            onKeyDown={(event) => handleResizeKeyDown("preview", event)}
            onReset={() => updateWidth("preview", DEFAULT_WORKSPACE_PANEL_WIDTHS.preview)}
          />
        </div>
      ) : (
        <div className="relative h-full min-h-0 min-w-0">
          <div data-panel="editor" className="relative h-full min-h-0 min-w-0 overflow-hidden">
            {renderPanel("editor")}
          </div>
          {files}
          {preview}
        </div>
      )}
    </div>
  );
}

type DesktopColumnsOptions = {
  filesShown: boolean;
  widths: WorkspacePanelWidths;
};

function buildDesktopColumns({ filesShown, widths }: DesktopColumnsOptions): string {
  const columns: string[] = [];
  if (filesShown) columns.push(`${widths.files}px`);
  columns.push("minmax(0, 1fr)", `${widths.preview}px`);
  return columns.join(" ");
}

type ResizeHandleProps = {
  side: WorkspaceResizeSide;
  offset: number;
  value: number;
  max: number;
  label: string;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  onReset: () => void;
};

function ResizeHandle({
  side,
  offset,
  value,
  max,
  label,
  onPointerDown,
  onKeyDown,
  onReset,
}: ResizeHandleProps) {
  const style =
    side === "files" ? ({ left: offset } as CSSProperties) : ({ right: offset } as CSSProperties);

  return (
    <div
      className={`group/splitter absolute inset-y-0 z-40 w-6 touch-none cursor-ew-resize outline-none ${side === "files" ? "-translate-x-1/2" : "translate-x-1/2"}`}
      style={style}
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      aria-valuenow={value}
      aria-valuetext={`${value} px`}
      tabIndex={0}
      data-resize-side={side}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={onReset}
    >
      <span className="pointer-events-none absolute inset-y-1 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-iris-accent opacity-0 shadow-[0_0_10px_color-mix(in_srgb,var(--accent)_72%,transparent)] transition-opacity duration-150 group-hover/splitter:opacity-80 group-focus-visible/splitter:opacity-80 group-active/splitter:opacity-100" />
    </div>
  );
}

function readStoredWidths(): WorkspacePanelWidths {
  if (typeof window === "undefined") return { ...DEFAULT_WORKSPACE_PANEL_WIDTHS };
  try {
    return readWorkspacePanelWidths(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null"));
  } catch {
    return { ...DEFAULT_WORKSPACE_PANEL_WIDTHS };
  }
}
