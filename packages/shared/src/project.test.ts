import { expect, test } from "bun:test";
import { LoroDoc } from "loro-crdt";

import {
  copyFile,
  createFile,
  createFolder,
  createProjectDoc,
  deleteFile,
  deleteFolder,
  getFileByPath,
  listFolders,
  listFiles,
  readSettings,
  renameFolder,
  renameFile,
  setSharedSetting,
} from "./project";

test("bootstraps the shared project with files and settings", () => {
  const doc = createProjectDoc();

  expect(listFiles(doc).map((file) => file.path)).toEqual([
    "index.html",
    "package.json",
    "src/App.tsx",
    "src/index.css",
    "src/main.tsx",
    "tsconfig.json",
    "vite.config.ts",
  ]);
  expect(getFileByPath(doc, "package.json")?.text.toString()).toContain('"react": "latest"');
  expect(getFileByPath(doc, "package.json")?.text.toString()).toContain('"name": "tsugite-room"');
  expect(getFileByPath(doc, "package.json")?.text.toString()).toContain('"tailwindcss": "latest"');
  expect(getFileByPath(doc, "package.json")?.text.toString()).toContain('"dev": "vite --host');
  expect(getFileByPath(doc, "index.html")?.text.toString()).toContain(
    "<title>Tsugite React workspace</title>",
  );
  expect(getFileByPath(doc, "index.html")?.text.toString()).toContain("/src/main.tsx");
  expect(getFileByPath(doc, "src/App.tsx")?.text.toString()).toContain("Tsugite workspace");
  expect(getFileByPath(doc, "src/main.tsx")?.text.toString()).toContain("<App />");
  expect(getFileByPath(doc, "src/index.css")?.text.toString()).toContain('@import "tailwindcss"');
  expect(getFileByPath(doc, "vite.config.ts")?.text.toString()).toContain("@tailwindcss/vite");
  expect(getFileByPath(doc, "tsconfig.json")?.text.toString()).toContain('"jsx": "react-jsx"');
  expect(readSettings(doc)).toEqual({
    theme: "paper",
    fontFamily: "JetBrains Mono",
    fontSize: 14,
    wordWrap: false,
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

  expect(getFileByPath(second, "src/main.tsx")?.text.toString()).toContain("shared");
  expect(readSettings(second)).toEqual({
    theme: "ink",
    fontFamily: "IBM Plex Mono",
    fontSize: 14,
    wordWrap: false,
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

test("creates and renames a file without changing its stable id", () => {
  const doc = new LoroDoc();
  const file = createFile(doc, "src/new.ts", "typescript", "export const value = 1");

  const renamed = renameFile(doc, file.id, "src/renamed.ts");
  expect(renamed.id).toBe(file.id);
  expect(getFileByPath(doc, "src/new.ts")).toBeUndefined();
  expect(getFileByPath(doc, "src/renamed.ts")?.text.toString()).toContain("value");
});

test("shares empty folders and supports folder operations", () => {
  const doc = new LoroDoc();
  createFolder(doc, "src/components");
  createFolder(doc, "src/components/buttons");
  expect(listFolders(doc)).toEqual(["src", "src/components", "src/components/buttons"]);

  const renamed = renameFolder(doc, "src/components", "src/ui");
  expect(renamed).toBe("src/ui");
  expect(listFolders(doc)).toEqual(["src", "src/ui", "src/ui/buttons"]);

  createFile(doc, "src/ui/Button.tsx", "typescript", "export const Button = null");
  deleteFolder(doc, "src/ui");
  expect(getFileByPath(doc, "src/ui/Button.tsx")).toBeUndefined();
  expect(listFolders(doc)).toEqual(["src"]);
});

test("copies and deletes a file while preserving its source", () => {
  const doc = new LoroDoc();
  const source = createFile(doc, "src/new.ts", "typescript", "export const value = 1");

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
  expect(() => createFile(fileParent, "README.md/docs.ts", "typescript")).toThrow(
    "A file already exists at README.md",
  );

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
  for (const path of ["", "src/", "src//main.ts", "src/./main.ts", "src/../main.ts"]) {
    expect(() => createFile(doc, path, "typescript")).toThrow(
      "File path must be a relative non-empty path",
    );
  }

  expect(createFile(doc, "src/version..ts", "typescript").path).toBe("src/version..ts");
});

test("skips folder names when choosing a copied file path", () => {
  const doc = new LoroDoc();
  const source = createFile(doc, "src/example.ts", "typescript", "export {};");
  createFolder(doc, "src/example copy.ts");

  expect(copyFile(doc, source.id).path).toBe("src/example copy 2.ts");
});

test("rejects renaming a folder that no longer exists", () => {
  const doc = new LoroDoc();

  expect(() => renameFolder(doc, "src", "lib")).toThrow("Folder does not exist");
  expect(() => renameFolder(doc, "src", "src")).toThrow("Folder does not exist");
  expect(listFolders(doc)).toEqual([]);
});
