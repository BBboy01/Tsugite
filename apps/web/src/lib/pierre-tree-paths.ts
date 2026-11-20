export function toPierreTreePaths(
  files: readonly string[],
  folders: readonly string[],
): string[] {
  const paths = new Set<string>();
  for (const folder of folders) paths.add(`${folder.replace(/\/+$/, "")}/`);
  for (const file of files) {
    const segments = file.split("/");
    for (let index = 1; index < segments.length; index += 1) {
      paths.add(`${segments.slice(0, index).join("/")}/`);
    }
    paths.add(file);
  }
  return [...paths].toSorted((left, right) => left.localeCompare(right));
}
