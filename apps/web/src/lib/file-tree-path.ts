export type FileDialogPathMode = "create-file" | "create-folder" | "rename-file" | "rename-folder";

export function resolveDialogPath(
  mode: FileDialogPathMode,
  directory: string,
  path: string,
): string {
  const value = path.trim().replace(/^\/+/, "");
  if (!value || !mode.startsWith("create") || !directory) return value;
  if (value === directory || value.startsWith(`${directory}/`)) return value;
  return `${directory}/${value}`;
}
