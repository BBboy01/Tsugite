import type { IntelligenceFile } from "./editor-intelligence";

export async function createMainThreadTypeScriptIntelligence(files: readonly IntelligenceFile[]) {
  const { createTypeScriptIntelligence } = await import("./typescript-intelligence");
  const first = files.find(
    (file) => !file.path.startsWith("node_modules/") && /\.[cm]?[jt]sx?$/.test(file.path),
  ) ?? { path: "empty.ts", text: "" };
  return createTypeScriptIntelligence(first.path, first.text, files);
}
