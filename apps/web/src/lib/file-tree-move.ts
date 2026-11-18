export function resolveMovePath(
  sourcePath: string,
  targetDirectory: string,
  filePaths: readonly string[],
  folderPaths: readonly string[],
): string {
  const name = sourcePath.split("/").at(-1) ?? sourcePath;
  const directory = targetDirectory ? `${targetDirectory}/` : "";
  const candidate = `${directory}${name}`;
  if (!isPathTaken(candidate, sourcePath, filePaths, folderPaths)) return candidate;

  const dot = name.lastIndexOf(".");
  const hasExtension = dot > 0;
  const stem = hasExtension ? name.slice(0, dot) : name;
  const extension = hasExtension ? name.slice(dot) : "";
  for (let suffix = 2; ; suffix += 1) {
    const nextPath = `${directory}${stem} ${suffix}${extension}`;
    if (!isPathTaken(nextPath, sourcePath, filePaths, folderPaths)) return nextPath;
  }
}

function isPathTaken(
  path: string,
  sourcePath: string,
  filePaths: readonly string[],
  folderPaths: readonly string[],
): boolean {
  return (
    (path !== sourcePath && filePaths.includes(path)) ||
    folderPaths.some((folder) => folder === path || folder.startsWith(`${path}/`))
  );
}
