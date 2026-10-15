import type { ProjectFile, ProjectSettings } from "@iris/shared";
import type { EditorLocation } from "../lib/editor-navigation";
import type { ProjectDeclarations } from "../lib/room-typescript-intelligence";

export type PreviewPaneProps = {
  file: ProjectFile;
  files: ProjectFile[];
  folders: string[];
  settings: ProjectSettings;
  declarations?: ProjectDeclarations;
  previewConsoleOpen: boolean;
  onPreviewConsoleOpenChange: (open: boolean) => void;
  onNavigateToSource?: (location: EditorLocation) => void;
};
