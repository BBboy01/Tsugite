import type { InlineEditMode } from "../lib/file-tree-edit-model";
import type { FileTreeTarget } from "../lib/file-tree-model";

export type FileTreeDeleteTarget = Exclude<FileTreeTarget, null> & { anchorRect: DOMRect };

export type FileTreeContextTarget = { type: "file"; id: string } | { type: "folder"; path: string };

export type InlineEditState = {
  mode: InlineEditMode;
  target: FileTreeTarget;
  directory: string;
  value: string;
  error?: string;
};
