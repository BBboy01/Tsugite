import { getFileById, listFiles } from "@iris/shared";
import type { LoroDoc } from "loro-crdt";
import type { IntelligenceFile } from "./editor-intelligence";

export type RoomTypeScriptSourceFile = IntelligenceFile & { id: string };
export type RoomTypeScriptSourceChange = {
  workspace: boolean;
  fileIds: readonly string[];
};

export interface RoomTypeScriptSource {
  readFiles(): readonly RoomTypeScriptSourceFile[];
  readFile(id: string): RoomTypeScriptSourceFile | undefined;
  subscribe(listener: (change: RoomTypeScriptSourceChange) => void): () => void;
}

export function createRoomTypeScriptSource(doc: LoroDoc): RoomTypeScriptSource {
  return {
    readFiles: () =>
      doc.getByPath("files")
        ? listFiles(doc).map((file) => ({
            id: file.id,
            path: file.path,
            text: file.text.toString(),
          }))
        : [],
    readFile: (id) => {
      const file = getFileById(doc, id);
      return file
        ? { id: file.id, path: file.path, text: file.text.toString() }
        : undefined;
    },
    subscribe: (listener) =>
      doc.subscribe((batch) => {
        const roots = batch.events
          .map((event) => event.path[0])
          .filter((root): root is string => typeof root === "string");
        const workspace = roots.some(
          (root) => root === "files" || root === "filePaths",
        );
        const fileIds = [
          ...new Set(roots.filter((root) => root.startsWith("file:"))),
        ].map((root) => root.slice("file:".length));
        if (workspace || fileIds.length) listener({ workspace, fileIds });
      }),
  };
}
