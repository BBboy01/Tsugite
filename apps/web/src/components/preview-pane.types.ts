import type { ProjectFile, ProjectSettings } from "@iris/shared";
import type { EditorLocation } from "../lib/editor-navigation";

export type PreviewPaneProps = {
  file: ProjectFile;
  files: ProjectFile[];
  folders: string[];
  settings: ProjectSettings;
  onNavigateToSource?: (location: EditorLocation) => void;
};
