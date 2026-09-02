import { LoroDoc, LoroMap, LoroText } from "loro-crdt";

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

const DEFAULT_SETTINGS: ProjectSettings = {
  theme: "paper",
  fontFamily: "JetBrains Mono",
  fontSize: 14,
  wordWrap: false,
  packageManager: "pnpm",
  autoInstall: true,
  autoStartPreview: true,
};

const DEFAULT_FILES: Array<{
  path: string;
  language: FileLanguage;
  source: string;
}> = [
  {
    path: "package.json",
    language: "javascript",
    source: `{
  "name": "tsugite-room",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0"
  },
  "dependencies": {
    "react": "latest",
    "react-dom": "latest"
  },
  "devDependencies": {
    "@tailwindcss/vite": "latest",
    "@types/react": "latest",
    "@types/react-dom": "latest",
    "@vitejs/plugin-react": "latest",
    "tailwindcss": "latest",
    "typescript": "latest",
    "vite": "latest"
  }
}`,
  },
  {
    path: "index.html",
    language: "javascript",
    source: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Tsugite React workspace</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`,
  },
  {
    path: "src/App.tsx",
    language: "typescript",
    source: `import { useState } from "react";

export function App() {
  const [count, setCount] = useState(0);

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-cyan-300">
          Tsugite workspace
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">React + TypeScript + Vite</h1>
        <p className="mt-4 max-w-xl text-slate-300">
          This starter project is shared with everyone in the room and styled with Tailwind CSS.
        </p>
        <button
          className="mt-8 rounded-lg bg-cyan-400 px-4 py-2 font-medium text-slate-950 transition hover:bg-cyan-300"
          type="button"
          onClick={() => setCount((value) => value + 1)}
        >
          Count is {count}
        </button>
      </div>
    </main>
  );
}`,
  },
  {
    path: "src/index.css",
    language: "javascript",
    source: `@import "tailwindcss";

:root {
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  color-scheme: dark;
  background: #020617;
}

body {
  min-width: 320px;
  margin: 0;
}`,
  },
  {
    path: "src/main.tsx",
    language: "typescript",
    source: `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);`,
  },
  {
    path: "tsconfig.json",
    language: "javascript",
    source: `{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}`,
  },
  {
    path: "vite.config.ts",
    language: "typescript",
    source: `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
});`,
  },
];

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
  settings.set("packageManager", DEFAULT_SETTINGS.packageManager);
  settings.set("autoInstall", DEFAULT_SETTINGS.autoInstall);
  settings.set("autoStartPreview", DEFAULT_SETTINGS.autoStartPreview);

  for (const file of DEFAULT_FILES) {
    createFile(doc, file.path, file.language, file.source);
  }

  if (files.size !== DEFAULT_FILES.length || filePaths.size !== DEFAULT_FILES.length) {
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
  const fileId = crypto.randomUUID();
  const files = doc.getMap("files");
  const filePaths = doc.getMap("filePaths");
  if (filePaths.get(normalizedPath)) {
    throw new Error(`A file already exists at ${normalizedPath}`);
  }
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

  return {
    id: fileId,
    path: normalizedPath,
    language,
    kind: "file",
    text,
  };
}

export function renameFile(doc: LoroDoc, fileId: string, nextPath: string): ProjectFile {
  const normalizedPath = normalizePath(nextPath);
  const files = doc.getMap("files");
  const filePaths = doc.getMap("filePaths");
  const metadata = files.get(fileId);
  if (!isProjectFileMap(metadata)) {
    throw new Error("File does not exist");
  }
  const previousPath = metadata.get("path") as string | undefined;

  const existingFileId = filePaths.get(normalizedPath) as string | undefined;
  if (existingFileId && existingFileId !== fileId) {
    throw new Error(`A file already exists at ${normalizedPath}`);
  }

  if (previousPath && previousPath !== normalizedPath) {
    filePaths.delete(previousPath);
  }

  metadata.set("path", normalizedPath);
  filePaths.set(normalizedPath, fileId);
  ensureParentFolders(doc, normalizedPath);
  return readFile(doc, fileId);
}

export function createFolder(doc: LoroDoc, path: string): string {
  const normalizedPath = normalizePath(path);
  if (doc.getMap("filePaths").get(normalizedPath)) {
    throw new Error(`A file already exists at ${normalizedPath}`);
  }
  const folders = doc.getMap("folders");
  if (folders.get(normalizedPath)) {
    throw new Error(`A folder already exists at ${normalizedPath}`);
  }
  folders.set(normalizedPath, true);
  ensureParentFolders(doc, normalizedPath);
  return normalizedPath;
}

export function renameFolder(doc: LoroDoc, path: string, nextPath: string): string {
  const normalizedPath = normalizePath(path);
  const normalizedNextPath = normalizePath(nextPath);
  if (normalizedPath === normalizedNextPath) return normalizedPath;
  if (normalizedNextPath.startsWith(`${normalizedPath}/`)) {
    throw new Error("A folder cannot be moved inside itself");
  }
  if (doc.getMap("filePaths").get(normalizedNextPath)) {
    throw new Error(`A file already exists at ${normalizedNextPath}`);
  }

  const folderPaths = listFolders(doc);
  if (folderPaths.includes(normalizedNextPath)) {
    throw new Error(`A folder already exists at ${normalizedNextPath}`);
  }

  const files = listFiles(doc).filter((file) => file.path.startsWith(`${normalizedPath}/`));
  const folders = doc.getMap("folders");
  for (const folderPath of folders.keys()) {
    if (folderPath === normalizedPath || folderPath.startsWith(`${normalizedPath}/`)) {
      folders.delete(folderPath);
      folders.set(replacePathPrefix(folderPath, normalizedPath, normalizedNextPath), true);
    }
  }
  folders.set(normalizedNextPath, true);

  for (const file of files) {
    renameFile(doc, file.id, replacePathPrefix(file.path, normalizedPath, normalizedNextPath));
  }
  ensureParentFolders(doc, normalizedNextPath);
  return normalizedNextPath;
}

export function copyFile(doc: LoroDoc, fileId: string): ProjectFile {
  const file = getFileById(doc, fileId);
  if (!file) throw new Error("File does not exist");
  return createFile(doc, getCopyPath(doc, file.path), file.language, file.text.toString());
}

export function deleteFile(doc: LoroDoc, fileId: string): void {
  const file = getFileById(doc, fileId);
  if (!file) return;
  doc.getMap("files").delete(fileId);
  doc.getMap("filePaths").delete(file.path);
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
    if (folderPath === normalizedPath || folderPath.startsWith(`${normalizedPath}/`)) {
      folders.delete(folderPath);
    }
  }
}

export function listFolders(doc: LoroDoc): string[] {
  const folderPaths = new Set<string>();
  const folders = doc.getMap("folders");
  for (const folderPath of folders.keys()) folderPaths.add(folderPath);

  for (const file of listFiles(doc)) ensureFolderAncestors(folderPaths, file.path);
  return [...folderPaths].toSorted((left, right) => left.localeCompare(right));
}

export function listFiles(doc: LoroDoc): ProjectFile[] {
  const files = doc.getMap("files");
  return files
    .keys()
    .map((fileId) => readFile(doc, String(fileId)))
    .toSorted((left, right) => left.path.localeCompare(right.path));
}

export function getFileByPath(doc: LoroDoc, path: string): ProjectFile | undefined {
  const fileId = doc.getMap("filePaths").get(normalizePath(path)) as string | undefined;
  return fileId ? readFile(doc, fileId) : undefined;
}

export function getFileById(doc: LoroDoc, fileId: string): ProjectFile | undefined {
  const files = doc.getMap("files");
  return files.get(fileId) ? readFile(doc, fileId) : undefined;
}

export function readSettings(doc: LoroDoc): ProjectSettings {
  const settings = doc.getMap("settings");
  const theme = settings.get("theme");
  const packageManager = settings.get("packageManager");
  return {
    theme: isWorkspaceTheme(theme) ? theme : DEFAULT_SETTINGS.theme,
    fontFamily: String(settings.get("fontFamily") ?? DEFAULT_SETTINGS.fontFamily),
    fontSize: readFontSize(settings.get("fontSize")),
    wordWrap: settings.get("wordWrap") === true,
    packageManager: isPackageManager(packageManager)
      ? packageManager
      : DEFAULT_SETTINGS.packageManager,
    autoInstall: settings.get("autoInstall") !== false,
    autoStartPreview: settings.get("autoStartPreview") !== false,
  };
}

function isWorkspaceTheme(value: unknown): value is WorkspaceTheme {
  return typeof value === "string" && WORKSPACE_THEME_IDS.includes(value as WorkspaceTheme);
}

function readFontSize(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 10 && value <= 24
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
  const metadata = doc.getMap("files").ensureMergeableMap(fileId);
  const path = String(metadata.get("path") ?? fileId);
  const language = metadata.get("language") === "javascript" ? "javascript" : "typescript";

  return {
    id: fileId,
    path,
    language,
    kind: "file",
    text: doc.getText(`file:${fileId}`),
  };
}

function normalizePath(path: string): string {
  const normalized = path.trim().replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) {
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

function ensureFolderAncestors(folderPaths: Set<string>, filePath: string): void {
  const segments = filePath.split("/").slice(0, -1);
  for (let index = 1; index <= segments.length; index += 1) {
    folderPaths.add(segments.slice(0, index).join("/"));
  }
}

function replacePathPrefix(path: string, previousPrefix: string, nextPrefix: string): string {
  return `${nextPrefix}${path.slice(previousPrefix.length)}`;
}

function getCopyPath(doc: LoroDoc, path: string): string {
  const lastSlash = path.lastIndexOf("/");
  const directory = lastSlash === -1 ? "" : path.slice(0, lastSlash + 1);
  const filename = lastSlash === -1 ? path : path.slice(lastSlash + 1);
  const extensionIndex = filename.lastIndexOf(".");
  const stem = extensionIndex > 0 ? filename.slice(0, extensionIndex) : filename;
  const extension = extensionIndex > 0 ? filename.slice(extensionIndex) : "";
  let copyIndex = 1;
  let candidate = `${directory}${stem} copy${extension}`;
  while (doc.getMap("filePaths").get(candidate)) {
    copyIndex += 1;
    candidate = `${directory}${stem} copy ${copyIndex}${extension}`;
  }
  return candidate;
}

export function isProjectFileMap(value: unknown): value is LoroMap {
  return value instanceof LoroMap;
}
