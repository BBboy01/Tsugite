export type RuntimeError =
  | "cross-origin-isolation-required"
  | "storage-partitioning-required"
  | "invalid-package-json"
  | "missing-package-json"
  | "missing-preview-script"
  | "install-failed"
  | "start-failed"
  | "server-exited"
  | "runtime-unavailable";

export function isStoragePartitioningErrorUrl(url: string): boolean {
  return /localservice@sw-install-error/i.test(url);
}

export function getRuntimeError(error: unknown): RuntimeError {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" &&
          error !== null &&
          "message" in error &&
          typeof error.message === "string"
        ? error.message
        : undefined;
  if (message && isStoragePartitioningErrorMessage(message)) return "storage-partitioning-required";
  if (message && isRuntimeError(message)) return message;
  return "runtime-unavailable";
}

function isStoragePartitioningErrorMessage(message: string): boolean {
  return /storage[ -]partition(?:ing)?|third[- ]party storage/i.test(message);
}

function isRuntimeError(value: string): value is RuntimeError {
  return [
    "cross-origin-isolation-required",
    "storage-partitioning-required",
    "invalid-package-json",
    "missing-package-json",
    "missing-preview-script",
    "install-failed",
    "start-failed",
    "server-exited",
    "runtime-unavailable",
  ].includes(value);
}
