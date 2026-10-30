import type { ReactNode } from "react";

import type { WorkspacePanelId } from "../lib/workspace-layout-model";

type WorkspacePanelFrameProps = {
  panel: WorkspacePanelId;
  children: ReactNode;
};

export function WorkspacePanelFrame({ panel, children }: WorkspacePanelFrameProps) {
  const surfaceClass =
    panel === "files" ? "bg-iris-rail" : panel === "preview" ? "bg-iris-preview" : "bg-iris-editor";

  return (
    <div
      className={`relative flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden ${surfaceClass}`}
    >
      <div className="min-h-0 min-w-0 flex-1">{children}</div>
    </div>
  );
}
