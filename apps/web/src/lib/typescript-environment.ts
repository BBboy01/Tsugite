import * as ts from "typescript-legacy";
import type { IntelligenceFile } from "./editor-intelligence";

const normalizeDirectory = (name: string) => name.replace(/\/$/, "") || "/";

export function createEditorTypeScriptEnvironment(
  path: string,
  source: string,
  projectFiles: readonly IntelligenceFile[],
  libraries: readonly IntelligenceFile[],
) {
  const compilerOptions = {
    allowJs: true,
    jsx: ts.JsxEmit.Preserve,
    esModuleInterop: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noLib: libraries.length === 0,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
  };
  const files = new Map<string, string>(
    [...libraries, ...projectFiles].map((file) => [`/${file.path.replace(/^\//, "")}`, file.text]),
  );
  const absolutePath = `/${path.replace(/^\//, "")}`;
  files.set(absolutePath, source);
  const directories = new Map<string, Set<string>>();
  const addDirectories = (fileName: string) => {
    const parts = fileName.split("/").filter(Boolean);
    let parent = "/";
    for (const part of parts.slice(0, -1)) {
      const children = directories.get(parent) ?? new Set<string>();
      children.add(part);
      directories.set(parent, children);
      parent = parent === "/" ? `/${part}` : `${parent}/${part}`;
    }
    if (!directories.has(parent)) directories.set(parent, new Set());
  };
  files.forEach((_, fileName) => addDirectories(fileName));
  const system = {
    useCaseSensitiveFileNames: true,
    getCurrentDirectory: () => "/",
    getDirectories: (name: string) => [...(directories.get(normalizeDirectory(name)) ?? [])],
    directoryExists: (name: string) => directories.has(normalizeDirectory(name)),
    fileExists: (name: string) => files.has(name),
    readFile: (name: string) => files.get(name),
    writeFile: (name: string, text: string) => files.set(name, text),
    realpath: (name: string) => name,
  };
  const versions = new Map<string, number>();
  let projectVersion = 0;
  // Publish text versions synchronously; TypeScript parses only when a query needs them.
  const languageService = ts.createLanguageService({
    ...system,
    useCaseSensitiveFileNames: () => system.useCaseSensitiveFileNames,
    getCompilationSettings: () => compilerOptions,
    getDefaultLibFileName: () => "/__typescript/lib/lib.es2022.full.d.ts",
    getProjectVersion: () => String(projectVersion),
    getScriptFileNames: () => [...files.keys()].filter((name) => /\.[cm]?[jt]sx?$/.test(name)),
    getScriptVersion: (fileName) => String(versions.get(fileName) ?? 0),
    getScriptSnapshot(fileName) {
      const text = files.get(fileName);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
  });
  const createFile = (fileName: string, content: string) => {
    if (files.get(fileName) === content) return;
    system.writeFile(fileName, content);
    addDirectories(fileName);
    versions.set(fileName, ++projectVersion);
    if (fileName.endsWith("/package.json")) languageService.cleanupSemanticCache();
  };
  return {
    sys: system,
    languageService,
    getSourceFile: (fileName: string) => languageService.getProgram()?.getSourceFile(fileName),
    createFile,
    updateFile(fileName: string, content: string, span?: ts.TextSpan) {
      const previous = files.get(fileName);
      if (previous === undefined) throw new Error(`Did not find a source file for ${fileName}`);
      createFile(
        fileName,
        span
          ? previous.slice(0, span.start) + content + previous.slice(span.start + span.length)
          : content,
      );
    },
    deleteFile(fileName: string) {
      if (!files.has(fileName)) return;
      files.delete(fileName);
      directories.clear();
      files.forEach((_, name) => addDirectories(name));
      versions.delete(fileName);
      projectVersion++;
      if (fileName.endsWith("/package.json")) languageService.cleanupSemanticCache();
    },
  };
}
