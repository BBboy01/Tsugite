import type { IntelligenceFile } from "./editor-intelligence";

export const DECLARATION_LIMITS = {
  files: 1024,
  fileBytes: 1024 * 1024,
  totalBytes: 8 * 1024 * 1024,
  metadataBytes: 64 * 1024,
  entries: 8192,
} as const;

export const DECLARATION_SCAN_OUTPUT_BYTES = 16 * 1024 * 1024;

export type DeclarationScanResult =
  | { status: "ok"; files: IntelligenceFile[] }
  | { status: "disabled"; reason: string };

const encoder = new TextEncoder();

function isDeclarationPath(path: string): boolean {
  if (!path || path.length > 1024 || /[\\:?#]/.test(path)) return false;
  if (
    [...path].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  ) {
    return false;
  }
  const parts = path.split("/");
  if (parts[0] === "__typescript") return false;
  if (parts.some((part) => !part || part === "." || part === ".." || part.startsWith(".env"))) {
    return false;
  }
  if (path === "package.json") return true;
  if (parts[0] === "node_modules") {
    const packageLength = parts[1]?.startsWith("@") ? 3 : 2;
    if (parts.length <= packageLength || (packageLength === 3 && parts[1] === "@")) return false;
    return /\.d\.(?:ts|mts|cts)$/.test(path) || parts.at(-1) === "package.json";
  }
  return /\.d\.(?:ts|mts|cts)$/.test(path);
}

export function validateDeclarationFiles(files: readonly IntelligenceFile[]): string | undefined {
  if (!Array.isArray(files)) return "Invalid declaration scan result";
  if (files.length > DECLARATION_LIMITS.files) return "TypeScript declaration file limit exceeded";
  const paths = new Set<string>();
  let totalBytes = 0;
  for (const file of files) {
    if (!file || typeof file.path !== "string" || !isDeclarationPath(file.path)) {
      return "Invalid TypeScript declaration path";
    }
    if (typeof file.text !== "string") return "Invalid TypeScript declaration content";
    if (paths.has(file.path)) return "Duplicate TypeScript declaration path";
    paths.add(file.path);
    const bytes = encoder.encode(file.text).byteLength;
    const metadata = file.path === "package.json" || file.path.endsWith("/package.json");
    if (bytes > (metadata ? DECLARATION_LIMITS.metadataBytes : DECLARATION_LIMITS.fileBytes)) {
      return "TypeScript declaration byte limit exceeded";
    }
    totalBytes += bytes;
    if (totalBytes > DECLARATION_LIMITS.totalBytes) {
      return "TypeScript declaration workspace limit exceeded";
    }
    if (metadata) {
      try {
        const value: unknown = JSON.parse(file.text);
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          return "Invalid TypeScript package metadata";
        }
      } catch {
        return "Invalid TypeScript package metadata";
      }
    }
  }
  return undefined;
}

export function parseDeclarationScan(output: string): IntelligenceFile[] {
  if (
    output.length > DECLARATION_SCAN_OUTPUT_BYTES ||
    encoder.encode(output).byteLength > DECLARATION_SCAN_OUTPUT_BYTES
  ) {
    throw new Error("TypeScript declaration output limit exceeded");
  }
  let result: unknown;
  try {
    result = JSON.parse(output);
  } catch {
    throw new Error("Invalid declaration scan result");
  }
  if (!result || typeof result !== "object" || !("status" in result)) {
    throw new Error("Invalid declaration scan result");
  }
  if (result.status === "disabled" && "reason" in result && typeof result.reason === "string") {
    if (!result.reason || result.reason.length > 1024) {
      throw new Error("Invalid declaration scan result");
    }
    throw new Error(`TypeScript declaration scan disabled: ${result.reason}`);
  }
  if (result.status !== "ok" || !("files" in result) || !Array.isArray(result.files)) {
    throw new Error("Invalid declaration scan result");
  }
  const error = validateDeclarationFiles(result.files);
  if (error) throw new Error(error);
  return result.files.map(({ path, text }: IntelligenceFile) => ({ path, text }));
}
