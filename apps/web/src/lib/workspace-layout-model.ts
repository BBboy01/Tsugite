export const WORKSPACE_PANEL_IDS = ["files", "editor", "preview"] as const;
export type WorkspacePanelId = (typeof WORKSPACE_PANEL_IDS)[number];
export type MobileWorkspacePanel = Extract<WorkspacePanelId, "files" | "preview">;

export type WorkspacePanelWidths = {
  files: number;
  preview: number;
};

export type WorkspaceResizeSide = keyof WorkspacePanelWidths;

export const DEFAULT_WORKSPACE_PANEL_WIDTHS: WorkspacePanelWidths = {
  files: 240,
  preview: 360,
};

const PANEL_WIDTH_LIMITS = {
  files: { min: 160, max: 420 },
  preview: { min: 220, max: 720 },
} as const;

const MIN_EDITOR_WIDTH = 320;

export function constrainWorkspacePanelWidths(
  widths: WorkspacePanelWidths,
  containerWidth: number,
  visibleSides: Record<WorkspaceResizeSide, boolean>,
  resizedSide?: WorkspaceResizeSide,
): WorkspacePanelWidths {
  const next = {
    files: clamp(
      Math.round(widths.files),
      PANEL_WIDTH_LIMITS.files.min,
      PANEL_WIDTH_LIMITS.files.max,
    ),
    preview: clamp(
      Math.round(widths.preview),
      PANEL_WIDTH_LIMITS.preview.min,
      PANEL_WIDTH_LIMITS.preview.max,
    ),
  };
  const availableForSides = Math.max(0, Math.round(containerWidth) - MIN_EDITOR_WIDTH);

  if (!visibleSides.files && !visibleSides.preview) return next;
  if (!visibleSides.files) {
    next.preview = Math.min(next.preview, availableForSides);
    return next;
  }
  if (!visibleSides.preview) {
    next.files = Math.min(next.files, availableForSides);
    return next;
  }
  if (next.files + next.preview <= availableForSides) return next;

  if (resizedSide === "files") {
    next.files = Math.max(PANEL_WIDTH_LIMITS.files.min, availableForSides - next.preview);
    return next;
  }
  if (resizedSide === "preview") {
    next.preview = Math.max(PANEL_WIDTH_LIMITS.preview.min, availableForSides - next.files);
    return next;
  }

  const previewReduction = Math.min(
    next.preview - PANEL_WIDTH_LIMITS.preview.min,
    next.files + next.preview - availableForSides,
  );
  next.preview -= previewReduction;
  next.files = Math.max(PANEL_WIDTH_LIMITS.files.min, availableForSides - next.preview);
  return next;
}

export function readWorkspacePanelWidths(value: unknown): WorkspacePanelWidths {
  if (!value || typeof value !== "object") return { ...DEFAULT_WORKSPACE_PANEL_WIDTHS };
  const widths = value as Partial<WorkspacePanelWidths>;
  if (typeof widths.files !== "number" || typeof widths.preview !== "number") {
    return { ...DEFAULT_WORKSPACE_PANEL_WIDTHS };
  }
  return constrainWorkspacePanelWidths(widths as WorkspacePanelWidths, Number.MAX_SAFE_INTEGER, {
    files: true,
    preview: true,
  });
}

export function toggleMobileWorkspacePanel(
  current: MobileWorkspacePanel | null,
  panel: MobileWorkspacePanel,
): MobileWorkspacePanel | null {
  return current === panel ? null : panel;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
