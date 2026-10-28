export function openEditorTab(paths: string[], path: string): string[] {
  return paths.includes(path) ? paths : [...paths, path];
}

export function reorderEditorTabs(paths: string[], nextPaths: readonly string[]): string[] {
  if (nextPaths.length !== paths.length) return paths;
  const reorderedPaths = new Set(nextPaths);
  if (reorderedPaths.size !== paths.length || paths.some((path) => !reorderedPaths.has(path))) {
    return paths;
  }
  if (nextPaths.every((path, index) => path === paths[index])) return paths;
  return [...nextPaths];
}

export type EditorTabCloseMode = "others" | "right" | "all";

export function closeEditorTabs(
  paths: string[],
  path: string,
  activePath: string,
  mode: EditorTabCloseMode,
): { paths: string[]; nextPath: string } {
  const index = paths.indexOf(path);
  if (mode !== "all" && index === -1) return { paths, nextPath: activePath };
  const nextPaths = mode === "all" ? [] : mode === "others" ? [path] : paths.slice(0, index + 1);
  return {
    paths: nextPaths,
    nextPath: nextPaths.includes(activePath) ? activePath : (nextPaths.at(-1) ?? ""),
  };
}

export function getEditorTabLabels(paths: string[]): string[] {
  const segments = paths.map((path) => path.split("/").filter(Boolean));
  const depths = segments.map(() => 1);

  while (true) {
    const labels = segments.map(
      (parts, index) => parts.slice(-depths[index]).join("/") || paths[index],
    );
    const matchingLabels = new Map<string, number[]>();

    labels.forEach((label, index) => {
      const matches = matchingLabels.get(label) ?? [];
      matches.push(index);
      matchingLabels.set(label, matches);
    });

    let changed = false;
    for (const matches of matchingLabels.values()) {
      if (matches.length < 2) continue;
      for (const index of matches) {
        if (depths[index] >= segments[index].length) continue;
        depths[index] += 1;
        changed = true;
      }
    }

    if (!changed) return labels;
  }
}

export function closeEditorTab(
  paths: string[],
  path: string,
  activePath: string,
): { paths: string[]; nextPath: string } {
  const index = paths.indexOf(path);
  if (index === -1) return { paths, nextPath: activePath };

  const nextPaths = paths.filter((item) => item !== path);
  if (path !== activePath) return { paths: nextPaths, nextPath: activePath };

  return {
    paths: nextPaths,
    nextPath: nextPaths[index] ?? nextPaths[index - 1] ?? "",
  };
}
