import { LoroDoc, LoroMap, LoroText } from "loro-crdt";
import { DEFAULT_FILES } from "./default-project-files";

export type FileLanguage = "typescript" | "javascript";
export type PackageManager = "pnpm" | "npm" | "yarn";
export const WORKSPACE_THEME_IDS = [
  "paper",
  "ink",
  "solarized-light",
  "solarized-dark",
  "tokyo-night",
  "dracula",
  "catppuccin-latte",
  "catppuccin-mocha",
  "github-light",
  "github-dark",
  "nord",
  "gruvbox-dark-medium",
  "one-dark-pro",
  "rose-pine",
  "everforest-dark",
  "kanagawa-wave",
] as const;

export type WorkspaceTheme = (typeof WORKSPACE_THEME_IDS)[number];

export type ProjectSettings = {
  theme: WorkspaceTheme;
  fontFamily: string;
  fontSize: number;
  wordWrap: boolean;
  relativeLineNumbers: boolean;
  normalCursorStyle:
    | "block"
    | "line"
    | "underline"
    | "block-blink"
    | "line-blink"
    | "underline-blink";
  packageManager: PackageManager;
  autoInstall: boolean;
  autoStartPreview: boolean;
};

export type ProjectFile = {
  id: string;
  path: string;
  language: FileLanguage;
  kind: "file";
  text: LoroText;
};

type ProjectFileMetadata = Omit<ProjectFile, "text">;

const fileMetadataCache = new WeakMap<
  LoroDoc,
  { version: string; files: ProjectFileMetadata[] }
>();

export type WorkspaceSnapshot = {
  files: ProjectFile[];
  folders: string[];
  settings: ProjectSettings;
};

const DEFAULT_SETTINGS: ProjectSettings = {
  theme: "paper",
  fontFamily: "JetBrains Mono",
  fontSize: 14,
  wordWrap: false,
  relativeLineNumbers: false,
  normalCursorStyle: "block",
  packageManager: "pnpm",
  autoInstall: true,
  autoStartPreview: true,
};

export function createProjectDoc(): LoroDoc {
  const doc = new LoroDoc();
  const files = doc.getMap("files");
  const filePaths = doc.getMap("filePaths");
  doc.getMap("folders");
  const settings = doc.getMap("settings");

  settings.set("theme", DEFAULT_SETTINGS.theme);
  settings.set("fontFamily", DEFAULT_SETTINGS.fontFamily);
  settings.set("fontSize", DEFAULT_SETTINGS.fontSize);
  settings.set("wordWrap", DEFAULT_SETTINGS.wordWrap);
  settings.set("relativeLineNumbers", DEFAULT_SETTINGS.relativeLineNumbers);
  settings.set("normalCursorStyle", DEFAULT_SETTINGS.normalCursorStyle);
  settings.set("packageManager", DEFAULT_SETTINGS.packageManager);
  settings.set("autoInstall", DEFAULT_SETTINGS.autoInstall);
  settings.set("autoStartPreview", DEFAULT_SETTINGS.autoStartPreview);
  for (const file of DEFAULT_FILES) {
    createFile(doc, file.path, file.language, file.source);
  }

  if (
    files.size !== DEFAULT_FILES.length ||
    filePaths.size !== DEFAULT_FILES.length
  ) {
    throw new Error("Project bootstrap did not create the expected files");
  }

  return doc;
}

export function createFile(
  doc: LoroDoc,
  path: string,
  language: FileLanguage,
  source = "",
): ProjectFile {
  const normalizedPath = normalizePath(path);
  assertPathAvailable(doc, normalizedPath);
  const fileId = crypto.randomUUID();
  const files = doc.getMap("files");
  const filePaths = doc.getMap("filePaths");
  const metadata = files.ensureMergeableMap(fileId);
  metadata.set("path", normalizedPath);
  metadata.set("language", language);
  metadata.set("kind", "file");
  filePaths.set(normalizedPath, fileId);
  ensureParentFolders(doc, normalizedPath);
  const text = doc.getText(`file:${fileId}`);
  if (source) {
    text.insert(0, source);
  }

  const cached = fileMetadataCache.get(doc);
  if (cached) {
    cached.files.push({
      id: fileId,
      path: normalizedPath,
      language,
      kind: "file",
    });
    cached.version = JSON.stringify(doc.frontiers());
  }

  return {
    id: fileId,
    path: normalizedPath,
    language,
    kind: "file",
    text,
  };
}

export function renameFile(
  doc: LoroDoc,
  fileId: string,
  nextPath: string,
): ProjectFile {
  const normalizedPath = normalizePath(nextPath);
  const files = doc.getMap("files");
  const filePaths = doc.getMap("filePaths");
  const metadata = files.get(fileId);
  if (!isProjectFileMap(metadata)) {
    throw new Error("File does not exist");
  }
  const previousPath = metadata.get("path") as string | undefined;

  assertPathAvailable(doc, normalizedPath, fileId);

  if (
    previousPath &&
    previousPath !== normalizedPath &&
    filePaths.get(previousPath) === fileId
  ) {
    filePaths.delete(previousPath);
  }

  metadata.set("path", normalizedPath);
  filePaths.set(normalizedPath, fileId);
  ensureParentFolders(doc, normalizedPath);
  return readFile(doc, fileId);
}

export function createFolder(doc: LoroDoc, path: string): string {
  const normalizedPath = normalizePath(path);
  assertPathAvailable(doc, normalizedPath);
  const folders = doc.getMap("folders");
  folders.set(normalizedPath, true);
  ensureParentFolders(doc, normalizedPath);
  return normalizedPath;
}

export function renameFolder(
  doc: LoroDoc,
  path: string,
  nextPath: string,
): string {
  const normalizedPath = normalizePath(path);
  const normalizedNextPath = normalizePath(nextPath);
  if (!hasFolderPath(doc, normalizedPath)) {
    throw new Error("Folder does not exist");
  }
  if (normalizedPath === normalizedNextPath) return normalizedPath;
  if (normalizedNextPath.startsWith(`${normalizedPath}/`)) {
    throw new Error("A folder cannot be moved inside itself");
  }
  assertPathAvailable(doc, normalizedNextPath);

  const files = listFiles(doc).filter((file) =>
    file.path.startsWith(`${normalizedPath}/`),
  );
  const folders = doc.getMap("folders");
  for (const folderPath of folders.keys()) {
    if (
      folderPath === normalizedPath ||
      folderPath.startsWith(`${normalizedPath}/`)
    ) {
      folders.delete(folderPath);
      folders.set(
        replacePathPrefix(folderPath, normalizedPath, normalizedNextPath),
        true,
      );
    }
  }
  folders.set(normalizedNextPath, true);

  for (const file of files) {
    renameFile(
      doc,
      file.id,
      replacePathPrefix(file.path, normalizedPath, normalizedNextPath),
    );
  }
  ensureParentFolders(doc, normalizedNextPath);
  return normalizedNextPath;
}

export function copyFile(doc: LoroDoc, fileId: string): ProjectFile {
  const file = getFileById(doc, fileId);
  if (!file) throw new Error("File does not exist");
  return createFile(
    doc,
    getCopyPath(doc, file.path),
    file.language,
    file.text.toString(),
  );
}

export function deleteFile(doc: LoroDoc, fileId: string): void {
  const file = getFileById(doc, fileId);
  if (!file) return;
  const metadata = doc.getMap("files").get(fileId) as LoroMap;
  const path = metadata.get("path") as string;
  doc.getMap("files").delete(fileId);
  const filePaths = doc.getMap("filePaths");
  if (filePaths.get(path) === fileId) filePaths.delete(path);
  const text = doc.getText(`file:${fileId}`);
  if (text.length > 0) text.delete(0, text.length);
}

export function deleteFolder(doc: LoroDoc, path: string): void {
  const normalizedPath = normalizePath(path);
  for (const file of listFiles(doc)) {
    if (file.path.startsWith(`${normalizedPath}/`)) deleteFile(doc, file.id);
  }
  const folders = doc.getMap("folders");
  for (const folderPath of folders.keys()) {
    if (
      folderPath === normalizedPath ||
      folderPath.startsWith(`${normalizedPath}/`)
    ) {
      folders.delete(folderPath);
    }
  }
}

export function listFolders(doc: LoroDoc): string[] {
  return listFoldersFromFiles(doc, listFileMetadata(doc));
}

export function readWorkspaceSnapshot(doc: LoroDoc): WorkspaceSnapshot {
  const files = listFiles(doc);
  return {
    files,
    folders: listFoldersFromFiles(doc, files),
    settings: readSettings(doc),
  };
}

function listFoldersFromFiles(
  doc: LoroDoc,
  files: readonly ProjectFileMetadata[],
): string[] {
  const folderPaths = new Set<string>();
  const folders = doc.getMap("folders");
  for (const folderPath of folders.keys()) folderPaths.add(folderPath);

  for (const file of files) ensureFolderAncestors(folderPaths, file.path);
  return [...folderPaths].toSorted((left, right) => left.localeCompare(right));
}

export function listFiles(doc: LoroDoc): ProjectFile[] {
  return listFileMetadata(doc)
    .map((file) => ({
      ...file,
      text: doc.getText(`file:${file.id}`),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function listFileMetadata(doc: LoroDoc): ProjectFileMetadata[] {
  // Frontiers include uncommitted edits, imports and checkout changes.
  const version = JSON.stringify(doc.frontiers());
  const cached = fileMetadataCache.get(doc);
  if (cached?.version === version) return cached.files;
  const files = doc.getMap("files").toJSON() as Record<
    string,
    { path?: string; language?: string }
  >;
  const entries = Object.entries(files).map(
    ([id, metadata]): ProjectFileMetadata => ({
      id,
      path: String(metadata.path ?? id),
      language:
        metadata.language === "javascript" ? "javascript" : "typescript",
      kind: "file",
    }),
  );
  const reservedPaths = new Set(entries.map((file) => file.path));
  const folderPaths = new Set(listFoldersFromFiles(doc, entries));
  if (
    reservedPaths.size === entries.length &&
    !entries.some((file) => folderPaths.has(file.path))
  ) {
    fileMetadataCache.set(doc, { version, files: entries });
    return entries;
  }
  entries.sort((left, right) => (left.id < right.id ? -1 : 1));
  const usedPaths = new Set(folderPaths);
  // Concurrent path claims resolve on read without writing repair operations.
  for (const file of entries) {
    if (usedPaths.has(file.path)) {
      const extensionIndex = file.path.lastIndexOf(".");
      const splitIndex =
        extensionIndex > file.path.lastIndexOf("/") + 1
          ? extensionIndex
          : file.path.length;
      const stem = file.path.slice(0, splitIndex);
      const extension = file.path.slice(splitIndex);
      let index = 1;
      let candidate = `${stem} conflict ${file.id}${extension}`;
      while (usedPaths.has(candidate) || reservedPaths.has(candidate)) {
        index += 1;
        candidate = `${stem} conflict ${file.id} ${index}${extension}`;
      }
      file.path = candidate;
    }
    usedPaths.add(file.path);
  }
  fileMetadataCache.set(doc, { version, files: entries });
  return entries;
}

export function getFileByPath(
  doc: LoroDoc,
  path: string,
): ProjectFile | undefined {
  const normalizedPath = normalizePath(path);
  const file = listFileMetadata(doc).find(
    (file) => file.path === normalizedPath,
  );
  return file ? { ...file, text: doc.getText(`file:${file.id}`) } : undefined;
}

export function getFileById(
  doc: LoroDoc,
  fileId: string,
): ProjectFile | undefined {
  const file = listFileMetadata(doc).find((file) => file.id === fileId);
  return file ? { ...file, text: doc.getText(`file:${file.id}`) } : undefined;
}

export function readSettings(doc: LoroDoc): ProjectSettings {
  const settings = doc.getMap("settings");
  const theme = settings.get("theme");
  const packageManager = settings.get("packageManager");
  return {
    theme: isWorkspaceTheme(theme) ? theme : DEFAULT_SETTINGS.theme,
    fontFamily: String(
      settings.get("fontFamily") ?? DEFAULT_SETTINGS.fontFamily,
    ),
    fontSize: readFontSize(settings.get("fontSize")),
    wordWrap: settings.get("wordWrap") === true,
    relativeLineNumbers: settings.get("relativeLineNumbers") === true,
    normalCursorStyle:
      settings.get("normalCursorStyle") === "line" ||
      settings.get("normalCursorStyle") === "underline" ||
      settings.get("normalCursorStyle") === "block-blink" ||
      settings.get("normalCursorStyle") === "line-blink" ||
      settings.get("normalCursorStyle") === "underline-blink"
        ? (settings.get(
            "normalCursorStyle",
          ) as ProjectSettings["normalCursorStyle"])
        : DEFAULT_SETTINGS.normalCursorStyle,
    packageManager: isPackageManager(packageManager)
      ? packageManager
      : DEFAULT_SETTINGS.packageManager,
    autoInstall: settings.get("autoInstall") !== false,
    autoStartPreview: settings.get("autoStartPreview") !== false,
  };
}

function isWorkspaceTheme(value: unknown): value is WorkspaceTheme {
  return (
    typeof value === "string" &&
    WORKSPACE_THEME_IDS.includes(value as WorkspaceTheme)
  );
}

function readFontSize(value: unknown): number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 10 &&
    value <= 24
    ? value
    : DEFAULT_SETTINGS.fontSize;
}

export function setSharedSetting(
  doc: LoroDoc,
  key: keyof ProjectSettings,
  value: ProjectSettings[typeof key],
): void {
  doc.getMap("settings").set(key, value);
}

function readFile(doc: LoroDoc, fileId: string): ProjectFile {
  const metadata = doc.getMap("files").get(fileId) as LoroMap;
  const path = String(metadata.get("path") ?? fileId);
  const language =
    metadata.get("language") === "javascript" ? "javascript" : "typescript";

  return {
    id: fileId,
    path,
    language,
    kind: "file",
    text: doc.getText(`file:${fileId}`),
  };
}

function assertPathAvailable(
  doc: LoroDoc,
  path: string,
  allowedFileId?: string,
): void {
  const files = listFileMetadata(doc);
  if (files.some((file) => file.path === path && file.id !== allowedFileId)) {
    throw new Error(`A file already exists at ${path}`);
  }

  if (hasFolderPath(doc, path, files)) {
    throw new Error(`A folder already exists at ${path}`);
  }

  const segments = path.split("/");
  for (let index = 1; index < segments.length; index += 1) {
    const parentPath = segments.slice(0, index).join("/");
    if (files.some((file) => file.path === parentPath)) {
      throw new Error(`A file already exists at ${parentPath}`);
    }
  }
}

function normalizePath(path: string): string {
  const normalized = path.trim().replace(/^\/+/, "");
  if (
    !normalized ||
    normalized
      .split("/")
      .some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("File path must be a relative non-empty path");
  }
  return normalized;
}

function isPackageManager(value: unknown): value is PackageManager {
  return value === "pnpm" || value === "npm" || value === "yarn";
}

function ensureParentFolders(doc: LoroDoc, path: string): void {
  const folders = doc.getMap("folders");
  const segments = path.split("/").slice(0, -1);
  for (let index = 1; index <= segments.length; index += 1) {
    folders.set(segments.slice(0, index).join("/"), true);
  }
}

function ensureFolderAncestors(
  folderPaths: Set<string>,
  filePath: string,
): void {
  const segments = filePath.split("/").slice(0, -1);
  for (let index = 1; index <= segments.length; index += 1) {
    folderPaths.add(segments.slice(0, index).join("/"));
  }
}

function replacePathPrefix(
  path: string,
  previousPrefix: string,
  nextPrefix: string,
): string {
  return `${nextPrefix}${path.slice(previousPrefix.length)}`;
}

function getCopyPath(doc: LoroDoc, path: string): string {
  const lastSlash = path.lastIndexOf("/");
  const directory = lastSlash === -1 ? "" : path.slice(0, lastSlash + 1);
  const filename = lastSlash === -1 ? path : path.slice(lastSlash + 1);
  const extensionIndex = filename.lastIndexOf(".");
  const stem =
    extensionIndex > 0 ? filename.slice(0, extensionIndex) : filename;
  const extension = extensionIndex > 0 ? filename.slice(extensionIndex) : "";
  let copyIndex = 1;
  let candidate = `${directory}${stem} copy${extension}`;
  const files = listFileMetadata(doc);
  const filePaths = new Set(files.map((file) => file.path));
  while (filePaths.has(candidate) || hasFolderPath(doc, candidate, files)) {
    copyIndex += 1;
    candidate = `${directory}${stem} copy ${copyIndex}${extension}`;
  }
  return candidate;
}

function hasFolderPath(
  doc: LoroDoc,
  path: string,
  files = listFileMetadata(doc),
): boolean {
  return Boolean(
    doc.getMap("folders").get(path) ||
    files.some((file) => file.path.startsWith(`${path}/`)),
  );
}

export function isProjectFileMap(value: unknown): value is LoroMap {
  return value instanceof LoroMap;
}
