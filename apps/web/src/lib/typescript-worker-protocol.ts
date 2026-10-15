import type {
  IntelligenceFile,
  IntelligenceQuery,
  IntelligenceDiagnosticQuery,
  IntelligenceResult,
} from "./editor-intelligence";

export const SOURCE_LIMITS = { files: 512, fileBytes: 1024 * 1024, totalBytes: 16 * 1024 * 1024 };
export const WORKER_QUEUE_LIMIT = 32;
export const QUERY_TIMEOUT_MS = 2000;
export type QueryMethod =
  | "hover"
  | "completion"
  | "signatureHelp"
  | "diagnostics"
  | "definition"
  | "typeDefinition"
  | "implementation"
  | "references";
export type VersionedFile = IntelligenceFile & { version: number };
export type WorkerEnvelope = { epoch: number; requestId: string; workspaceVersion: number };
export type WorkerRequest = WorkerEnvelope &
  (
    | { kind: "initialize"; files: readonly VersionedFile[] }
    | { kind: "update"; changes: readonly VersionedFile[]; deleted: readonly string[] }
    | { kind: "query"; method: QueryMethod; query: IntelligenceQuery | IntelligenceDiagnosticQuery }
    | { kind: "cancel"; target: string }
  );
export type WorkerReply = WorkerEnvelope & {
  result: IntelligenceResult<unknown>;
  /** Navigation locations share one source snapshot per file over the worker boundary. */
  sourceSnapshots?: Record<string, string>;
};
export const isSourcePath = (path: string) => /\.[cm]?[jt]sx?$/.test(path);
export const isIntelligencePath = isSourcePath;
export function isSafeSourcePath(path: string): boolean {
  return (
    typeof path === "string" &&
    path.length > 0 &&
    path.length <= 1024 &&
    !/[\\:?#]/.test(path) &&
    !path.split("").some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) &&
    !path.startsWith("/") &&
    !path.startsWith("__typescript/") &&
    path
      .split("/")
      .every((part) => part !== "" && part !== "." && part !== ".." && !part.startsWith(".env"))
  );
}
export function validateQueryPath(path: string): string | undefined {
  if (!isSafeSourcePath(path) || !isSourcePath(path)) return "Invalid TypeScript query path";
}
export function validateSourceFiles(files: readonly IntelligenceFile[]): string | undefined {
  if (files.length > SOURCE_LIMITS.files) return "TypeScript source file limit exceeded";
  let total = 0;
  const seen = new Set<string>();
  const encoder = new TextEncoder();
  for (const file of files) {
    if (
      !isSafeSourcePath(file.path) ||
      !isSourcePath(file.path) ||
      file.path.startsWith("node_modules/") ||
      seen.has(file.path)
    )
      return "Invalid TypeScript source path";
    seen.add(file.path);
    if (typeof file.text !== "string" || file.text.length > SOURCE_LIMITS.fileBytes)
      return "TypeScript source file limit exceeded";
    const bytes = encoder.encode(file.text).byteLength;
    if (bytes > SOURCE_LIMITS.fileBytes) return "TypeScript source file limit exceeded";
    total += bytes;
    if (total > SOURCE_LIMITS.totalBytes) return "TypeScript source workspace limit exceeded";
  }
}

export function validateWorkspaceFiles(files: readonly IntelligenceFile[]): string | undefined {
  return validateSourceFiles(files);
}
