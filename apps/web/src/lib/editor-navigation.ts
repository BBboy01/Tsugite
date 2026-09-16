import type { VirtualTypeScriptEnvironment } from "@typescript/vfs";

export type NavigationKind = "definition" | "type" | "implementation" | "references";
export type NavigationFile = { path: string; text: string };
export type EditorLocation = {
  path: string;
  from: number;
  to: number;
  line: number;
  column: number;
  source: string;
};

export function queryEditorLocations(
  environment: VirtualTypeScriptEnvironment,
  files: readonly NavigationFile[],
  path: string,
  position: number,
  kind: NavigationKind,
): EditorLocation[] {
  const sources = new Map(
    files
      .filter((file) => /\.[cm]?[jt]sx?$/.test(file.path))
      .map((file) => [`/${file.path.replace(/^\//, "")}`, file.text]),
  );
  // Synchronize on demand so unopened and collaborative edits participate in navigation.
  for (const oldPath of environment.sys.readDirectory("/")) {
    if (oldPath !== "/lib.d.ts" && !sources.has(oldPath)) environment.deleteFile(oldPath);
  }
  for (const [filePath, text] of sources) {
    if (environment.sys.readFile(filePath) === text) continue;
    environment.createFile(filePath, text);
  }
  const absolutePath = `/${path.replace(/^\//, "")}`;
  const source = sources.get(absolutePath);
  if (source === undefined || position < 0 || position > source.length) return [];
  const service = environment.languageService;
  const methods = {
    definition: service.getDefinitionAtPosition,
    type: service.getTypeDefinitionAtPosition,
    implementation: service.getImplementationAtPosition,
    references: service.getReferencesAtPosition,
  };
  const results: readonly { fileName: string; textSpan: { start: number; length: number } }[] =
    methods[kind](absolutePath, position) ?? [];
  const seen = new Set<string>();
  return results.flatMap((result) => {
    const text = sources.get(result.fileName);
    const { start, length } = result.textSpan;
    const key = `${result.fileName}:${start}:${length}`;
    if (text === undefined || start < 0 || start + length > text.length || seen.has(key)) return [];
    seen.add(key);
    const prefix = text.slice(0, start);
    return [
      {
        path: result.fileName.slice(1),
        from: start,
        to: start + length,
        line: prefix.split("\n").length,
        column: start - prefix.lastIndexOf("\n"),
        source: text,
      },
    ];
  });
}
