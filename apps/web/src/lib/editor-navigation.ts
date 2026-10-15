import type {
  EditorIntelligence,
  IntelligenceFile,
  IntelligenceLocation,
  IntelligenceResult,
} from "./editor-intelligence";

export type NavigationKind = "definition" | "type" | "implementation" | "references";
export type NavigationFile = IntelligenceFile;
export type EditorLocation = IntelligenceLocation;

export async function queryEditorLocations(
  intelligence: EditorIntelligence,
  files: readonly NavigationFile[] | undefined,
  path: string,
  position: number,
  kind: NavigationKind,
): Promise<IntelligenceResult<EditorLocation[]>> {
  if (files) {
    const synced = await intelligence.syncWorkspace(files);
    if (synced.status !== "ok") return synced;
  }
  const query = { path, position };
  return kind === "type" ? intelligence.typeDefinition(query) : intelligence[kind](query);
}

/** Capture content rather than object identity: Loro containers can mutate in place. */
export function matchesIntelligenceSnapshot(
  snapshot: readonly NavigationFile[],
  current: readonly NavigationFile[],
): boolean {
  if (snapshot.length !== current.length) return false;
  const content = new Map(current.map((file) => [file.path, file.text]));
  return snapshot.every((file) => content.get(file.path) === file.text);
}

export class LatestIntelligenceRequest {
  private generation = 0;
  begin(): () => boolean {
    const generation = ++this.generation;
    return () => generation === this.generation;
  }
  invalidate(): void {
    this.generation++;
  }
}
