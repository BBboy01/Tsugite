export const DECLARATION_SCAN_LIMITS = {
  files: 1024,
  fileBytes: 1024 * 1024,
  totalBytes: 8 * 1024 * 1024,
  metadataBytes: 64 * 1024,
  entries: 8192,
  outputBytes: 16 * 1024 * 1024,
  outputChunks: 8192,
  deadlineMs: 2000,
  pathLength: 1024,
  reasonLength: 1024,
  sourceFiles: 512,
  sourceFileBytes: 1024 * 1024,
  sourceTotalBytes: 16 * 1024 * 1024,
  sourceRequestBytes: 32 * 1024 * 1024,
} as const;

export type DeclarationScanLimits = {
  [Key in keyof typeof DECLARATION_SCAN_LIMITS]: number;
};
