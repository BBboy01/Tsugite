export function formatEditorLineNumber(
  lineNumber: number,
  currentLineNumber: number,
  relativeLineNumbers: boolean,
): string {
  if (!relativeLineNumbers || lineNumber === currentLineNumber) {
    return String(lineNumber);
  }

  return String(Math.abs(lineNumber - currentLineNumber));
}
