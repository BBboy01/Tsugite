import * as ts from "typescript-legacy";
import { createSystem, createVirtualTypeScriptEnvironment } from "@typescript/vfs";

type TypeScriptModule = typeof import("typescript");

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
  const typescript = {
    ...ts,
    createLanguageService(host: ts.LanguageServiceHost) {
      // VFS 1.6 treats empty strings as missing snapshots; retain actual empty files.
      return ts.createLanguageService({
        ...host,
        getScriptSnapshot(fileName) {
          return system.readFile(fileName) === ""
            ? ts.ScriptSnapshot.fromString("")
            : host.getScriptSnapshot(fileName);
        },
      });
    },
  } as unknown as TypeScriptModule;
  const environment = createVirtualTypeScriptEnvironment(
    system,
    [...files.keys()],
    typescript,
    compilerOptions,
  );
  return environment;
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
