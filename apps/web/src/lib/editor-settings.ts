export const EDITOR_FONT_OPTIONS = [
  "JetBrains Mono",
  "Geist Mono",
  "Fira Code",
  "Cascadia Code",
  "IBM Plex Mono",
  "Source Code Pro",
  "Roboto Mono",
  "SF Mono",
  "Menlo",
  "Monaco",
  "Consolas",
  "Hack",
  "Inconsolata",
  "Ubuntu Mono",
  "Space Mono",
  "DM Mono",
  "Monaspace Neon",
  "ui-monospace",
] as const;

export const EDITOR_FONT_SIZE_MIN = 10;
export const EDITOR_FONT_SIZE_MAX = 24;

export function filterEditorFonts(query: string, currentFont: string): string[] {
  const fonts = EDITOR_FONT_OPTIONS.includes(currentFont as (typeof EDITOR_FONT_OPTIONS)[number])
    ? [...EDITOR_FONT_OPTIONS]
    : [currentFont, ...EDITOR_FONT_OPTIONS];
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return fonts;
  return fonts.filter((font) => font.toLocaleLowerCase().includes(normalizedQuery));
}
