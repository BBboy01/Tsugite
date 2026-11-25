import { expect, test } from "bun:test";
import { LoroDoc, LoroMap } from "loro-crdt";

import {
  copyFile,
  createFile,
  createFolder,
  createProjectDoc,
  deleteFile,
  deleteFolder,
  getFileByPath,
  getFileById,
  listFiles,
  listFolders,
  readWorkspaceSnapshot,
  readSettings,
  renameFolder,
  renameFile,
  setSharedSetting,
} from "./project";

test("bootstraps the shared project with files and settings", () => {
  const doc = createProjectDoc();
  const snapshot = readWorkspaceSnapshot(doc);

  expect(snapshot.files.map((file) => file.path)).toEqual([
    "index.html",
    "package.json",
    "pnpm-workspace.yaml",
    "src/App.tsx",
    "src/index.css",
    "src/main.tsx",
    "tsconfig.json",
    "vite.config.ts",
  ]);
  const manifest = JSON.parse(
    getFileByPath(doc, "package.json")!.text.toString(),
  );
  expect(manifest.name).toBe("tsugite-room");
  expect(manifest.scripts.dev).toBe("vite --host 0.0.0.0");
  expect(manifest.dependencies.react).toBe("19.3.1");
  expect(manifest.dependencies["react-dom"]).toBe("19.3.1");
  expect(manifest.devDependencies["@vitejs/plugin-react"]).toBe("5.2.0");
  expect(manifest.devDependencies.vite).toBe("7.3.7");
  expect(manifest).not.toHaveProperty("overrides");
  expect(manifest).not.toHaveProperty("resolutions");
  expect(manifest).not.toHaveProperty("pnpm");
  for (const version of Object.values({
    ...manifest.dependencies,
    ...manifest.devDependencies,
  })) {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  }
  expect(getFileByPath(doc, "index.html")?.text.toString()).toContain(
    "<title>Tsugite React workspace</title>",
  );
  expect(getFileByPath(doc, "pnpm-workspace.yaml")?.text.toString()).toBe(
    "packages:\n  - .\n",
  );
  expect(getFileByPath(doc, "index.html")?.text.toString()).toContain(
    "/src/main.tsx",
  );
  expect(getFileByPath(doc, "src/App.tsx")?.text.toString()).toContain(
    "Tsugite workspace",
  );
  expect(getFileByPath(doc, "src/main.tsx")?.text.toString()).toContain(
    "<App />",
  );
  expect(getFileByPath(doc, "src/index.css")?.text.toString()).toContain(
    '@import "tailwindcss"',
  );
  expect(getFileByPath(doc, "vite.config.ts")?.text.toString()).toContain(
    "@tailwindcss/vite",
  );
  expect(getFileByPath(doc, "tsconfig.json")?.text.toString()).toContain(
    '"jsx": "react-jsx"',
  );
  expect(snapshot.settings).toEqual({
    theme: "paper",
    fontFamily: "JetBrains Mono",
    fontSize: 14,
    wordWrap: false,
    relativeLineNumbers: false,
    normalCursorStyle: "block",
    packageManager: "pnpm",
    autoInstall: true,
    autoStartPreview: true,
  });
});

test("merges file text and settings through a Loro update", () => {
  const first = createProjectDoc();
  const second = new LoroDoc();
  const file = getFileByPath(first, "src/main.tsx")!;

  file.text.insert(file.text.length, '\nconsole.log("shared")');
  setSharedSetting(first, "theme", "ink");
  setSharedSetting(first, "fontFamily", "IBM Plex Mono");
  second.import(first.export({ mode: "snapshot" }));

  expect(getFileByPath(second, "src/main.tsx")?.text.toString()).toContain(
    "shared",
  );
  expect(readSettings(second)).toEqual({
    theme: "ink",
    fontFamily: "IBM Plex Mono",
    fontSize: 14,
    wordWrap: false,
    relativeLineNumbers: false,
    normalCursorStyle: "block",
    packageManager: "pnpm",
    autoInstall: true,
    autoStartPreview: true,
  });
});

test("accepts built-in workspace themes and falls back unknown values", () => {
  const doc = createProjectDoc();
  doc.getMap("settings").set("theme", "tokyo-night");
  expect(readSettings(doc).theme).toBe("tokyo-night");

  doc.getMap("settings").set("theme", "custom-theme");
  expect(readSettings(doc).theme).toBe("paper");
});

test("shares editor font size and wrapping settings", () => {
  const first = createProjectDoc();
  setSharedSetting(first, "fontSize", 18);
  setSharedSetting(first, "wordWrap", true);

  const second = new LoroDoc();
  second.import(first.export({ mode: "snapshot" }));

  expect(readSettings(second).fontSize).toBe(18);
  expect(readSettings(second).wordWrap).toBe(true);
});

test("shares relative line number settings", () => {
  const first = createProjectDoc();
  first.getMap("settings").set("relativeLineNumbers", true);

  const second = new LoroDoc();
  second.import(first.export({ mode: "snapshot" }));

  expect(readSettings(second).relativeLineNumbers).toBe(true);
});

test("creates and renames a file without changing its stable id", () => {
  const doc = new LoroDoc();
  const file = createFile(
    doc,
    "src/new.ts",
    "typescript",
    "export const value = 1",
  );

  const renamed = renameFile(doc, file.id, "src/renamed.ts");
  expect(renamed.id).toBe(file.id);
  expect(getFileByPath(doc, "src/new.ts")).toBeUndefined();
  expect(getFileByPath(doc, "src/renamed.ts")?.text.toString()).toContain(
    "value",
  );
});

test("shares empty folders and supports folder operations", () => {
  const doc = new LoroDoc();
  createFolder(doc, "src/components");
  createFolder(doc, "src/components/buttons");
  expect(listFolders(doc)).toEqual([
    "src",
    "src/components",
    "src/components/buttons",
  ]);

  const renamed = renameFolder(doc, "src/components", "src/ui");
  expect(renamed).toBe("src/ui");
  expect(listFolders(doc)).toEqual(["src", "src/ui", "src/ui/buttons"]);

  createFile(
    doc,
    "src/ui/Button.tsx",
    "typescript",
    "export const Button = null",
  );
  deleteFolder(doc, "src/ui");
  expect(getFileByPath(doc, "src/ui/Button.tsx")).toBeUndefined();
  expect(listFolders(doc)).toEqual(["src"]);
});

test("copies and deletes a file while preserving its source", () => {
  const doc = new LoroDoc();
  const source = createFile(
    doc,
    "src/new.ts",
    "typescript",
    "export const value = 1",
  );

  const copied = copyFile(doc, source.id);
  expect(copied.path).toBe("src/new copy.ts");
  expect(copied.text.toString()).toBe(source.text.toString());

  deleteFile(doc, source.id);
  expect(getFileByPath(doc, "src/new.ts")).toBeUndefined();
  expect(getFileByPath(doc, copied.path)?.text.toString()).toContain("value");
});

test("rejects file and folder paths that conflict with existing entries", () => {
  const fileParent = new LoroDoc();
  createFile(fileParent, "README.md", "javascript");
  expect(() => createFolder(fileParent, "README.md/docs")).toThrow(
    "A file already exists at README.md",
  );
  expect(() =>
    createFile(fileParent, "README.md/docs.ts", "typescript"),
  ).toThrow("A file already exists at README.md");

  const folderPath = new LoroDoc();
  createFolder(folderPath, "src");
  expect(() => createFile(folderPath, "src", "typescript")).toThrow(
    "A folder already exists at src",
  );

  const fileRename = createFile(folderPath, "src/entry.ts", "typescript");
  expect(() => renameFile(folderPath, fileRename.id, "src")).toThrow(
    "A folder already exists at src",
  );

  const folderRename = new LoroDoc();
  createFolder(folderRename, "src");
  createFile(folderRename, "README.md", "javascript");
  expect(() => renameFolder(folderRename, "src", "README.md/docs")).toThrow(
    "A file already exists at README.md",
  );

  const inferredFolder = new LoroDoc();
  createFile(inferredFolder, "src/main.ts", "typescript");
  inferredFolder.getMap("folders").delete("src");
  expect(() => createFile(inferredFolder, "src", "typescript")).toThrow(
    "A folder already exists at src",
  );
});

test("rejects malformed paths without rejecting valid dotted filenames", () => {
  const doc = new LoroDoc();
  for (const path of [
    "",
    "src/",
    "src//main.ts",
    "src/./main.ts",
    "src/../main.ts",
  ]) {
    expect(() => createFile(doc, path, "typescript")).toThrow(
      "File path must be a relative non-empty path",
    );
  }

  expect(createFile(doc, "src/version..ts", "typescript").path).toBe(
    "src/version..ts",
  );
});

test("skips folder names when choosing a copied file path", () => {
  const doc = new LoroDoc();
  const source = createFile(doc, "src/example.ts", "typescript", "export {};");
  createFolder(doc, "src/example copy.ts");

  expect(copyFile(doc, source.id).path).toBe("src/example copy 2.ts");
});

test("rejects renaming a folder that no longer exists", () => {
  const doc = new LoroDoc();

  expect(() => renameFolder(doc, "src", "lib")).toThrow(
    "Folder does not exist",
  );
  expect(() => renameFolder(doc, "src", "src")).toThrow(
    "Folder does not exist",
  );
  expect(listFolders(doc)).toEqual([]);
});

test("concurrent renames leave only the merged path occupied", () => {
  const first = new LoroDoc();
  const file = createFile(first, "entry.ts", "typescript", "shared source");
  const second = new LoroDoc();
  second.import(first.export({ mode: "snapshot" }));

  renameFile(first, file.id, "left.ts");
  renameFile(second, file.id, "right.ts");
  first.import(second.export({ mode: "update" }));
  second.import(first.export({ mode: "update" }));

  const mergedPath = listFiles(first)[0].path;
  const unusedPath = mergedPath === "left.ts" ? "right.ts" : "left.ts";
  expect(listFiles(second).map((entry) => entry.path)).toEqual([mergedPath]);
  for (const doc of [first, second]) {
    expect(getFileByPath(doc, unusedPath)).toBeUndefined();
    expect(createFile(doc, unusedPath, "typescript").path).toBe(unusedPath);
    deleteFile(doc, file.id);
    expect(getFileByPath(doc, mergedPath)).toBeUndefined();
    expect(getFileById(doc, file.id)).toBeUndefined();
    expect(createFile(doc, mergedPath, "typescript").path).toBe(mergedPath);
  }
});

test("concurrent same-path files keep distinct deterministic paths and contents", () => {
  const first = new LoroDoc();
  const second = new LoroDoc();
  const left = createFile(first, "same.ts", "typescript", "left source");
  const right = createFile(second, "same.ts", "typescript", "right source");
  first.import(second.export({ mode: "update" }));
  second.import(first.export({ mode: "update" }));

  const snapshot = (doc: LoroDoc) =>
    listFiles(doc).map((file) => ({
      id: file.id,
      path: file.path,
      source: file.text.toString(),
    }));
  expect(snapshot(first)).toEqual(snapshot(second));
  expect(new Set(snapshot(first).map((file) => file.path)).size).toBe(2);
  expect(
    snapshot(first)
      .map((file) => file.source)
      .toSorted(),
  ).toEqual(["left source", "right source"]);
  const beforeRead = first.version();
  for (const file of listFiles(first)) {
    expect(getFileByPath(first, file.path)?.id).toBe(file.id);
    expect(getFileById(first, file.id)?.path).toBe(file.path);
  }
  expect(first.version().compare(beforeRead)).toBe(0);
  const reloaded = new LoroDoc();
  reloaded.import(first.export({ mode: "snapshot" }));
  expect(snapshot(reloaded)).toEqual(snapshot(first));

  renameFile(first, left.id, "left.ts");
  first.commit();
  second.import(first.export({ mode: "update" }));
  expect(snapshot(first)).toEqual(snapshot(second));
  expect(getFileByPath(first, "same.ts")?.id).toBe(right.id);
  deleteFile(first, left.id);
  expect(getFileByPath(first, "same.ts")?.text.toString()).toBe("right source");
});

test("concurrent file and directory claims preserve mountable distinct paths", () => {
  const first = new LoroDoc();
  const second = new LoroDoc();
  const file = createFile(first, "src", "typescript", "file source");
  createFile(second, "src/main.ts", "typescript", "nested source");
  first.import(second.export({ mode: "update" }));
  second.import(first.export({ mode: "update" }));

  for (const doc of [first, second]) {
    expect(getFileById(doc, file.id)?.path).not.toBe("src");
    expect(getFileById(doc, file.id)?.text.toString()).toBe("file source");
    expect(getFileByPath(doc, "src/main.ts")?.text.toString()).toBe(
      "nested source",
    );
    expect(listFolders(doc)).toEqual(["src"]);
    expect(
      listFiles(doc).some((entry) => listFolders(doc).includes(entry.path)),
    ).toBe(false);
  }
});

test("reads uncommitted metadata edits and checked-out paths", () => {
  const doc = new LoroDoc();
  const file = createFile(doc, "before.ts", "typescript", "source");
  doc.commit();
  const before = doc.frontiers();
  expect(getFileById(doc, file.id)?.path).toBe("before.ts");
  const metadata = doc.getMap("files").get(file.id) as LoroMap;
  metadata.set("path", "after.ts");
  expect(getFileById(doc, file.id)?.path).toBe("after.ts");
  expect(getFileByPath(doc, "before.ts")).toBeUndefined();
  doc.commit();
  doc.checkout(before);
  expect(getFileById(doc, file.id)?.path).toBe("before.ts");
  doc.attach();
  expect(getFileById(doc, file.id)?.path).toBe("after.ts");
});
