export type IntelligenceFile = { path: string; text: string };

let requestIdSequence = 0;

export function createIntelligenceRequestId(prefix: string): string {
  return `${prefix}-${++requestIdSequence}`;
}
export type IntelligenceLocation = {
  path: string;
  from: number;
  to: number;
  line: number;
  column: number;
  source: string;
};
export type IntelligenceRange = { from: number; to: number };
export type IntelligenceHover = IntelligenceRange & { signature: string; documentation: string };
export type IntelligenceCompletion = {
  name: string;
  kind: string;
  sortText: string;
  insertText?: string;
  replacement?: IntelligenceRange;
};
export type IntelligenceSignature = {
  prefix: string;
  suffix: string;
  separator: string;
  parameters: { label: string; documentation: string }[];
  documentation: string;
};
export type IntelligenceSignatureHelp = {
  signatures: IntelligenceSignature[];
  activeSignature: number;
  activeParameter: number;
};
export type IntelligenceDiagnostic = IntelligenceRange & {
  code: number;
  severity: "error" | "warning" | "suggestion" | "message";
  message: string;
};
export type IntelligenceResult<T> =
  | { status: "ok"; value: T }
  | { status: "empty" | "cancelled" | "timeout" | "disposed" }
  | { status: "error"; message: string };
export type IntelligenceQuery = {
  path: string;
  /** Offsets and ranges use UTF-16 code units, matching editor transactions. */
  position: number;
  revision?: number;
  requestId?: string;
  timeoutMs?: number;
};
export type IntelligenceDiagnosticQuery = Omit<IntelligenceQuery, "position">;

/** Queries never mutate source ownership; sync/update publish derived snapshots only.
 * cancel applies to a pending requestId. Deadlines reject late results but do not
 * interrupt synchronous compiler computation. dispose is idempotent.
 */
export interface EditorIntelligence {
  readonly workspaceVersion: number;
  subscribeWorkspace(listener: () => void): () => void;
  syncWorkspace(files: readonly IntelligenceFile[]): Promise<IntelligenceResult<number>>;
  updateFile(file: IntelligenceFile): Promise<IntelligenceResult<null>>;
  hover(query: IntelligenceQuery): Promise<IntelligenceResult<IntelligenceHover>>;
  completion(query: IntelligenceQuery): Promise<IntelligenceResult<IntelligenceCompletion[]>>;
  signatureHelp(query: IntelligenceQuery): Promise<IntelligenceResult<IntelligenceSignatureHelp>>;
  diagnostics(
    query: IntelligenceDiagnosticQuery,
  ): Promise<IntelligenceResult<IntelligenceDiagnostic[]>>;
  definition(query: IntelligenceQuery): Promise<IntelligenceResult<IntelligenceLocation[]>>;
  typeDefinition(query: IntelligenceQuery): Promise<IntelligenceResult<IntelligenceLocation[]>>;
  implementation(query: IntelligenceQuery): Promise<IntelligenceResult<IntelligenceLocation[]>>;
  references(query: IntelligenceQuery): Promise<IntelligenceResult<IntelligenceLocation[]>>;
  cancel(requestId: string): void;
  dispose(): void;
}
