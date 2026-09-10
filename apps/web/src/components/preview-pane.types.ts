import type { ProjectFile, ProjectSettings } from "@iris/shared";

export type PreviewPaneProps = {
  file: ProjectFile;
  files: ProjectFile[];
  folders: string[];
  settings: ProjectSettings;
};
