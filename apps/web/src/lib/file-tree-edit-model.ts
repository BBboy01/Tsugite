export type InlineEditMode = "create-file" | "create-folder" | "rename-file" | "rename-folder";

export type InlineEditTarget =
  | { type: "file"; path: string }
  | { type: "folder"; path: string }
  | null;

export function getInlineEditDirectory(
  target: InlineEditTarget,
  mode: InlineEditMode = "create-file",
): string {
  if (!target) return "";
  if (target.type === "folder") {
    return mode.startsWith("rename") ? target.path.split("/").slice(0, -1).join("/") : target.path;
  }
  return target.path.split("/").slice(0, -1).join("/");
}

export function getInlineEditDefaultValue(
  mode: InlineEditMode,
  target: InlineEditTarget,
  fileCount: number,
): string {
  if (mode === "create-file") return `new-${fileCount + 1}.ts`;
  if (mode === "create-folder") return "new-folder";
  const path = target?.path ?? "";
  return path.split("/").at(-1) ?? path;
}

export function resolveInlineEdit(
  mode: InlineEditMode,
  directory: string,
  value: string,
): { status: "cancel" } | { status: "invalid" } | { status: "submit"; path: string } {
  const normalized = value.trim().replace(/^\/+/, "");
  if (!normalized) return mode.startsWith("create") ? { status: "cancel" } : { status: "invalid" };
  if (!directory) return { status: "submit", path: normalized };
  if (normalized.startsWith(`${directory}/`)) {
    return { status: "submit", path: normalized };
  }
  return { status: "submit", path: `${directory}/${normalized}` };
}
