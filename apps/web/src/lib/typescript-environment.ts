import * as ts from "typescript-legacy";
import { createSystem, createVirtualTypeScriptEnvironment } from "@typescript/vfs";

type TypeScriptModule = typeof import("typescript");

export function createEditorTypeScriptEnvironment(path: string, source: string) {
  const compilerOptions = {
    allowJs: true,
    esModuleInterop: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noLib: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
  };
  const typescript = ts as unknown as TypeScriptModule;
  const files = new Map<string, string>([
    [path, source],
    ["/lib.d.ts", EDITOR_LIB],
  ]);
  const system = createSystem(files);
  const environment = createVirtualTypeScriptEnvironment(
    system,
    [path, "/lib.d.ts"],
    typescript,
    compilerOptions,
  );
  environment.createFile(path, source);
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
