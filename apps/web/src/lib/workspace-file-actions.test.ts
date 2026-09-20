import { expect, test } from "bun:test";
import { LoroDoc } from "loro-crdt";
import {
  createFile,
  getFileByPath,
  listFiles,
  createFolder,
  listFolders,
  MAX_ROOM_UPDATE_BYTES,
} from "@iris/shared";
import { createWorkspaceFileActions } from "./workspace-file-actions";
import { RoomClient } from "./room-client";
import { WORKSPACE_CHANGE_ORIGIN } from "./editor-undo";

function actions(doc: LoroDoc, selectedPath = "") {
  let selected = selectedPath;
  let tabs = selectedPath ? [selectedPath] : [];
  return createWorkspaceFileActions({
    doc,
    selectedPath,
    openTabPaths: tabs,
    setSelectedPath: (next) => {
      selected = typeof next === "function" ? next(selected) : next;
    },
    setOpenTabPaths: (next) => {
      tabs = typeof next === "function" ? next(tabs) : next;
    },
    activateFile: (path) => {
      selected = path;
    },
    stopFollowing: () => {},
  });
}

for (const [path, language] of [
  ["notes.ts", "typescript"],
  ["app.js", "javascript"],
  ["view.JSX", "javascript"],
  ["config.json", "typescript"],
  ["index.html", "typescript"],
  ["style.css", "typescript"],
] as const) {
  test(`creates ${path} empty with the appropriate code fallback`, () => {
    const doc = new LoroDoc();
    expect(actions(doc).handleAddFile(null, path)).toBeUndefined();
    const file = getFileByPath(doc, path)!;
    expect(file.text.toString()).toBe("");
    expect(file.language).toBe(language);
  });
}

test("explicit deletion undo restores file contents independently of editor history", () => {
  const doc = new LoroDoc();
  const file = createFile(doc, "src/notes.js", "javascript", "const retained = 1");
  const recovery = actions(doc, file.path).handleDelete({ type: "file", file });
  expect(listFiles(doc)).toHaveLength(0);
  expect(recovery?.undo()).toBe(true);
  expect(getFileByPath(doc, file.path)?.text.toString()).toBe("const retained = 1");
  expect(getFileByPath(doc, file.path)?.language).toBe("javascript");
});

test("folder deletion undo restores nested files and empty folders", () => {
  const doc = new LoroDoc();
  createFile(doc, "src/notes.js", "javascript", "retained");
  createFolder(doc, "src/empty/nested");
  const recovery = actions(doc).handleDelete({ type: "folder", path: "src" });
  expect(listFolders(doc)).toEqual([]);
  expect(recovery?.undo()).toBe(true);
  expect(getFileByPath(doc, "src/notes.js")?.text.toString()).toBe("retained");
  expect(listFolders(doc)).toEqual(["src", "src/empty", "src/empty/nested"]);
});

test("undo refuses a remotely recreated path and does not partially restore a deleted folder", () => {
  const doc = new LoroDoc();
  createFile(doc, "src/a.ts", "typescript", "old a");
  createFile(doc, "src/b.ts", "typescript", "old b");
  const recovery = actions(doc).handleDelete({ type: "folder", path: "src" });
  const remote = new LoroDoc();
  remote.import(doc.export({ mode: "snapshot" }));
  createFile(remote, "src/b.ts", "typescript", "remote b");
  remote.commit();
  doc.import(remote.export({ mode: "snapshot" }));
  expect(recovery?.undo()).toBe(false);
  expect(listFiles(doc).map((file) => [file.path, file.text.toString()])).toEqual([
    ["src/b.ts", "remote b"],
  ]);
});

test("undo refuses a parent replaced by a file", () => {
  const doc = new LoroDoc();
  createFile(doc, "parent/src/a.ts", "typescript", "retained");
  const recovery = actions(doc).handleDelete({ type: "folder", path: "parent" });
  createFile(doc, "parent", "typescript", "remote");
  expect(recovery?.undo()).toBe(false);
  expect(getFileByPath(doc, "parent")?.text.toString()).toBe("remote");
});

for (const singleFile of [false, true]) {
  test(`deletion undo synchronizes ${singleFile ? "one large Unicode file" : "multiple 600 KB files"} within the update limit`, () => {
    const client = new RoomClient({
      roomId: "recovery",
      identity: { userId: "one", displayName: "User", color: "#7389b7" },
    });
    const { doc } = client;
    const sources = singleFile
      ? ["a" + "\u{1f680}\u4e2d".repeat(90_000), "\u4e2d\u{1f680}".repeat(90_000)]
      : ["a".repeat(600_000), "b".repeat(600_000)];
    const first = createFile(doc, "src/a.ts", "typescript", sources[0]);
    doc.commit();
    if (singleFile) first.text.push(sources[1]!);
    else createFile(doc, "src/b.ts", "typescript", sources[1]);
    doc.commit();
    expect(client.syncError).toBeUndefined();
    const recovery = actions(doc).handleDelete({ type: "folder", path: "src" });
    const remote = new LoroDoc();
    remote.import(doc.export({ mode: "snapshot" }));
    const sizes: number[] = [];
    const origins: (string | undefined)[] = [];
    doc.subscribeLocalUpdates((bytes) => {
      sizes.push(bytes.byteLength);
      if (bytes.byteLength <= MAX_ROOM_UPDATE_BYTES) remote.import(bytes);
    });
    doc.subscribe((event) => origins.push(event.origin));

    expect(recovery?.undo()).toBe(true);
    expect(client.syncError).toBeUndefined();
    expect(sizes.length).toBeGreaterThan(1);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(MAX_ROOM_UPDATE_BYTES);
    expect(new Set(origins)).toEqual(new Set([WORKSPACE_CHANGE_ORIGIN]));
    const expected = singleFile ? sources.join("") : sources[0];
    expect(getFileByPath(doc, "src/a.ts")?.text.toString()).toBe(expected);
    expect(getFileByPath(remote, "src/a.ts")?.text.toString()).toBe(expected);
    if (!singleFile) {
      expect(getFileByPath(remote, "src/b.ts")?.text.toString()).toBe(sources[1]);
    }
    expect(recovery?.undo()).toBe(false);
  });
}
