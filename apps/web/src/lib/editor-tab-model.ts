import type { PresenceMember, ProjectFile } from "@iris/shared";

import { getEditorTabLabels } from "./editor-tabs";
import { getFileCollaboratorCount } from "./presence";

export type EditorTabViewModel = {
  file: ProjectFile;
  label: string;
  active: boolean;
  collaboratorCount: number;
};

export function buildEditorTabViewModels(
  tabs: readonly ProjectFile[],
  activePath: string,
  remoteMembers: readonly PresenceMember[],
  currentUserId: string,
): EditorTabViewModel[] {
  const labels = getEditorTabLabels(tabs.map((tab) => tab.path));
  return tabs.map((file, index) => ({
    file,
    label: labels[index] ?? file.path,
    active: file.path === activePath,
    collaboratorCount: getFileCollaboratorCount(remoteMembers, currentUserId, file.path),
  }));
}
