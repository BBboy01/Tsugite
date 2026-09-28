import * as ts from "typescript-legacy";
import { createSystem } from "@typescript/vfs";

export function createEditorTypeScriptEnvironment(
  path: string,
  source: string,
  projectFiles: readonly { path: string; text: string }[] = [],
) {
  const compilerOptions = {
    allowJs: true,
    jsx: ts.JsxEmit.Preserve,
    esModuleInterop: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noLib: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
  };
  const files = new Map<string, string>(
    projectFiles
      .filter((file) => /\.[cm]?[jt]sx?$/.test(file.path))
      .map((projectFile) => [`/${projectFile.path.replace(/^\//, "")}`, projectFile.text]),
  );
  const absolutePath = `/${path.replace(/^\//, "")}`;
  files.set(absolutePath, source);
  files.set("/lib.d.ts", EDITOR_LIB);
  const system = createSystem(files);
  const versions = new Map<string, number>();
  let projectVersion = 0;
  // Publish text versions synchronously; TypeScript parses only when a query needs them.
  const languageService = ts.createLanguageService({
    ...system,
    useCaseSensitiveFileNames: () => system.useCaseSensitiveFileNames,
    getCompilationSettings: () => compilerOptions,
    getDefaultLibFileName: () => "/lib.d.ts",
    getProjectVersion: () => String(projectVersion),
    getScriptFileNames: () => [...files.keys()],
    getScriptVersion: (fileName) => String(versions.get(fileName) ?? 0),
    getScriptSnapshot(fileName) {
      const text = files.get(fileName);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
  });
  const createFile = (fileName: string, content: string) => {
    if (files.get(fileName) === content) return;
    system.writeFile(fileName, content);
    versions.set(fileName, ++projectVersion);
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
      versions.delete(fileName);
      projectVersion++;
    },
  };
}

const EDITOR_LIB = `
interface Array<T = any> { length: number; [n: number]: T }
interface Boolean {}
interface CallableFunction {}
interface Function {}
interface IArguments {}
interface NewableFunction {}
interface Number {}
interface Object {}
interface RegExp {}
interface String { length: number }
interface StringConstructor { new(value?: any): String }
declare const String: StringConstructor;
declare const console: { log(...args: any[]): void; warn(...args: any[]): void; error(...args: any[]): void };
`;
