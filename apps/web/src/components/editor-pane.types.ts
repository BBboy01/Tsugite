import type { PresenceMember, ProjectFile, ProjectSettings } from "@iris/shared";
import type { LoroDoc } from "loro-crdt";
import type { EditorLocation } from "../lib/editor-navigation";

export type EditorPaneProps = {
  doc: LoroDoc;
  file: ProjectFile;
  files: ProjectFile[];
  tabs: ProjectFile[];
  settings: ProjectSettings;
  vimMode: boolean;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onCursorChange: (cursor: { anchor: number; head: number }) => void;
  onLocalInteraction: () => void;
  followedSelection: { anchor: number; head: number } | null;
  isFollowing: boolean;
  remoteMembers: readonly PresenceMember[];
  currentUserId: string;
  onEditorFocusReady?: (focus: (() => void) | undefined) => void;
  requestedLocation?: EditorLocation;
  onLocationHandled?: () => void;
};
