import { preProcessFile } from "typescript-legacy";
import type { IntelligenceFile } from "./editor-intelligence";

export const DEFAULT_TYPESCRIPT_LIB = "lib.es2022.full.d.ts";

export async function loadTypeScriptStandardLibrary(
  read: (name: string) => Promise<string>,
): Promise<IntelligenceFile[]> {
  const loaded = new Map<string, Promise<IntelligenceFile>>();
  const visit = (name: string): Promise<IntelligenceFile> => {
    if (!/^lib\.[a-z0-9.]+\.d\.ts$/.test(name)) {
      return Promise.reject(new Error("Invalid TypeScript standard library name"));
    }
    const previous = loaded.get(name);
    if (previous) return previous;
    const pending = read(name).then(async (text) => {
      const references = preProcessFile(text).libReferenceDirectives;
      await Promise.all(references.map(({ fileName }) => visit(`lib.${fileName}.d.ts`)));
      return { path: `__typescript/lib/${name}`, text };
    });
    loaded.set(name, pending);
    return pending;
  };
  await visit(DEFAULT_TYPESCRIPT_LIB);
  return Promise.all(loaded.values());
}
