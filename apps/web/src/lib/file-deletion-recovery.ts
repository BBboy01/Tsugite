import {
  createFile,
  createFolder,
  getFileById,
  listFiles,
  listFolders,
  MAX_ROOM_UPDATE_BYTES,
  type FileLanguage,
} from "@iris/shared";
import type { LoroDoc } from "loro-crdt";
import type { FileTreeTarget } from "../components/file-tree";
import { WORKSPACE_CHANGE_ORIGIN } from "./editor-undo";

// UTF-8 uses at most three bytes per UTF-16 unit; leave room for CRDT metadata.
const RESTORE_CHUNK_CODE_UNITS = Math.floor(MAX_ROOM_UPDATE_BYTES / 8);

export type FileDeletionRecovery = { path: string; undo: () => boolean };

type DeletedItem = {
  path: string;
  files: { path: string; language: FileLanguage; source: string }[];
  folders: string[];
};

export function captureDeletedItem(
  doc: LoroDoc,
  target: Exclude<FileTreeTarget, null>,
): DeletedItem | undefined {
  const file = target.type === "file" ? getFileById(doc, target.file.id) : undefined;
  if (target.type === "file" && !file) return undefined;
  const path = file ? file.path : target.type === "folder" ? target.path : "";
  const folders =
    target.type === "folder"
      ? listFolders(doc).filter((folder) => folder === path || folder.startsWith(`${path}/`))
      : [];
  if (target.type === "folder" && !folders.includes(path)) return undefined;
  const files = file ? [file] : listFiles(doc).filter((item) => item.path.startsWith(`${path}/`));
  return {
    path,
    folders,
    files: files.map((item) => ({
      path: item.path,
      language: item.language,
      source: item.text.toString(),
    })),
  };
}

export function restoreDeletedItem(doc: LoroDoc, item: DeletedItem): boolean {
  const occupiedFiles = listFiles(doc).map((file) => file.path);
  const occupiedFolders = new Set(listFolders(doc));
  const paths = [...item.folders, ...item.files.map((file) => file.path)];
  // Check the entire snapshot before mutating so a conflict cannot leave a partial restore.
  if (
    paths.some(
      (path) =>
        occupiedFolders.has(path) ||
        occupiedFiles.some(
          (occupied) =>
            path === occupied || path.startsWith(`${occupied}/`) || occupied.startsWith(`${path}/`),
        ),
    )
  ) {
    return false;
  }
  for (const path of item.folders.toSorted((a, b) => a.split("/").length - b.split("/").length)) {
    createFolder(doc, path);
    doc.commit({ origin: WORKSPACE_CHANGE_ORIGIN });
  }
  for (const file of item.files) {
    const restored = createFile(doc, file.path, file.language);
    doc.commit({ origin: WORKSPACE_CHANGE_ORIGIN });
    for (let start = 0; start < file.source.length;) {
      let end = Math.min(start + RESTORE_CHUNK_CODE_UNITS, file.source.length);
      const last = file.source.charCodeAt(end - 1);
      const next = file.source.charCodeAt(end);
      if (last >= 0xd800 && last <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) end--;
      restored.text.push(file.source.slice(start, end));
      doc.commit({ origin: WORKSPACE_CHANGE_ORIGIN });
      start = end;
    }
  }
  return true;
}
