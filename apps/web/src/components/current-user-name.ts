export function getDisplayNameCommitValue(draft: string, current: string): string | undefined {
  const next = draft.trim();
  if (!next || next === current || next.length > 32) return undefined;
  return next;
}
