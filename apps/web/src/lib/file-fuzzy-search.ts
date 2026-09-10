import type { ProjectFile } from "@iris/shared";

export function fuzzyMatchFiles(files: readonly ProjectFile[], query: string): ProjectFile[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...files];
  return files
    .map((file, index) => ({ file, score: fuzzyScore(file.path.toLowerCase(), needle), index }))
    .filter((entry) => entry.score >= 0)
    .toSorted((left, right) => right.score - left.score || left.index - right.index)
    .map((entry) => entry.file);
}

export function fuzzyMatchIndexes(value: string, query: string): number[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const indexes: number[] = [];
  let cursor = 0;
  for (const character of needle) {
    const index = value.toLowerCase().indexOf(character, cursor);
    if (index < 0) return [];
    indexes.push(index);
    cursor = index + 1;
  }
  return indexes;
}

function fuzzyScore(value: string, needle: string): number {
  let score = 0;
  let cursor = 0;
  let previous = -2;
  for (const character of needle) {
    const index = value.indexOf(character, cursor);
    if (index < 0) return -1;
    score += index === previous + 1 ? 3 : index === 0 || value[index - 1] === "/" ? 4 : 1;
    previous = index;
    cursor = index + 1;
  }
  return score - value.length / 100;
}
