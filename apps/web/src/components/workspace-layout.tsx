import { useTranslation } from "react-i18next";
import {
  useEffect,
  useLayoutEffect,
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
import { WorkspacePanelFrame } from "./workspace-panel-frame";

type WorkspaceLayoutProps = {
  files: ReactNode;
  editor: ReactNode;
  preview: ReactNode;
  filesCollapsed: boolean;
  onFilesWidthChange: (width: number) => void;
};

const STORAGE_KEY = "iris.workspace-panels.v2";
const LEGACY_STORAGE_KEY = "iris.workspace-layout.v1";
const KEYBOARD_RESIZE_STEP = 16;

export function WorkspaceLayout({
  files,
  editor,
  preview,
  filesCollapsed,
  onFilesWidthChange,
}: WorkspaceLayoutProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const [containerWidth, setContainerWidth] = useState(1280);
  const [preferredWidths, setPreferredWidths] = useState<WorkspacePanelWidths>(readStoredWidths);
  const panelNodes = useMemo(
    () => ({ files, editor, preview }) satisfies Record<WorkspacePanelId, ReactNode>,
    [editor, files, preview],
  );
  const desktop = containerWidth > 760;
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

  useLayoutEffect(() => {
    onFilesWidthChange(panelWidths.files);
  }, [onFilesWidthChange, panelWidths.files]);

  const updateWidth = (side: WorkspaceResizeSide, nextValue: number) => {
    const nextWidths = constrainWorkspacePanelWidths(
      { ...panelWidths, [side]: nextValue },
      resizableWidth,
      visibleSides,
      side,
    );
    setPreferredWidths(nextWidths);
    if (side === "files") onFilesWidthChange(nextWidths.files);
  };

  const startResize = (side: WorkspaceResizeSide, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    resizeCleanupRef.current?.();
    const container = containerRef.current;
    container?.setAttribute("data-resizing", "true");
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
      container?.removeAttribute("data-resizing");
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

  const renderPanel = (panel: WorkspacePanelId) => (
    <WorkspacePanelFrame panel={panel}>{panelNodes[panel]}</WorkspacePanelFrame>
  );

  return (
    <div ref={containerRef} className="workspace-layout h-full min-h-0 min-w-0 overflow-hidden">
      {desktop ? (
        <div
          className="workspace-layout-grid relative grid h-full min-h-0 min-w-0 overflow-hidden"
          data-files-collapsed={!filesShown}
          style={{ gridTemplateColumns: desktopColumns }}
        >
          <div
            data-panel="files"
            data-files-collapsed={!filesShown}
            aria-hidden={!filesShown}
            inert={!filesShown}
            className="relative z-10 min-h-0 min-w-0 overflow-visible bg-iris-editor"
          >
            <div
              className="workspace-files-content h-full min-h-0"
              style={{ width: panelWidths.files }}
            >
              {renderPanel("files")}
            </div>
          </div>
          <div data-panel="editor" className="relative min-h-0 min-w-0 overflow-hidden">
            {renderPanel("editor")}
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
  return `${filesShown ? widths.files : 0}px minmax(0, 1fr) ${widths.preview}px`;
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
