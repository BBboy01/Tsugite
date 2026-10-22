import { WORKSPACE_THEME_IDS, type WorkspaceTheme } from "@iris/shared";
import type { Theme } from "@pierre/highlights";

export type WorkspaceThemeOption = {
  id: WorkspaceTheme;
  labelKey: string;
  dark: boolean;
  swatch: {
    background: string;
    accent: string;
    foreground: string;
  };
};

type HighlightsThemeLoader = () => Promise<{ default: Theme }>;

const HIGHLIGHTS_THEME_LOADERS: Record<WorkspaceTheme, HighlightsThemeLoader> = {
  paper: () => import("@pierre/highlights/themes/vitesse-light"),
  ink: () => import("@pierre/highlights/themes/vitesse-dark"),
  "solarized-light": () => import("@pierre/highlights/themes/solarized-light"),
  "solarized-dark": () => import("@pierre/highlights/themes/solarized-dark"),
  "tokyo-night": () => import("@pierre/highlights/themes/tokyo-night"),
  dracula: () => import("@pierre/highlights/themes/dracula"),
  "catppuccin-latte": () => import("@pierre/highlights/themes/catppuccin-latte"),
  "catppuccin-mocha": () => import("@pierre/highlights/themes/catppuccin-mocha"),
  "github-light": () => import("@pierre/highlights/themes/github-light"),
  "github-dark": () => import("@pierre/highlights/themes/github-dark"),
  nord: () => import("@pierre/highlights/themes/nord"),
  "gruvbox-dark-medium": () => import("@pierre/highlights/themes/gruvbox-dark-medium"),
  "one-dark-pro": () => import("@pierre/highlights/themes/one-dark-pro"),
  "rose-pine": () => import("@pierre/highlights/themes/rose-pine"),
  "everforest-dark": () => import("@pierre/highlights/themes/everforest-dark"),
  "kanagawa-wave": () => import("@pierre/highlights/themes/kanagawa-wave"),
};

const highlightsThemeCache = new Map<WorkspaceTheme, Promise<Theme>>();

export const WORKSPACE_THEME_OPTIONS: readonly WorkspaceThemeOption[] = [
  {
    id: "paper",
    labelKey: "settings.paperLight",
    dark: false,
    swatch: { background: "#f5f5f7", accent: "#007aff", foreground: "#1d1d1f" },
  },
  {
    id: "github-light",
    labelKey: "settings.theme.githubLight",
    dark: false,
    swatch: { background: "#ffffff", accent: "#0969da", foreground: "#1f2328" },
  },
  {
    id: "solarized-light",
    labelKey: "settings.theme.solarizedLight",
    dark: false,
    swatch: { background: "#fdf6e3", accent: "#268bd2", foreground: "#073642" },
  },
  {
    id: "catppuccin-latte",
    labelKey: "settings.theme.catppuccinLatte",
    dark: false,
    swatch: { background: "#eff1f5", accent: "#1e66f5", foreground: "#4c4f69" },
  },
  {
    id: "ink",
    labelKey: "settings.inkDark",
    dark: true,
    swatch: { background: "#1c1c1e", accent: "#ff9f0a", foreground: "#f5f5f7" },
  },
  {
    id: "github-dark",
    labelKey: "settings.theme.githubDark",
    dark: true,
    swatch: { background: "#0d1117", accent: "#58a6ff", foreground: "#e6edf3" },
  },
  {
    id: "solarized-dark",
    labelKey: "settings.theme.solarizedDark",
    dark: true,
    swatch: { background: "#002b36", accent: "#2aa198", foreground: "#839496" },
  },
  {
    id: "tokyo-night",
    labelKey: "settings.theme.tokyoNight",
    dark: true,
    swatch: { background: "#1a1b26", accent: "#7aa2f7", foreground: "#c0caf5" },
  },
  {
    id: "dracula",
    labelKey: "settings.theme.dracula",
    dark: true,
    swatch: { background: "#282a36", accent: "#bd93f9", foreground: "#f8f8f2" },
  },
  {
    id: "catppuccin-mocha",
    labelKey: "settings.theme.catppuccinMocha",
    dark: true,
    swatch: { background: "#1e1e2e", accent: "#cba6f7", foreground: "#cdd6f4" },
  },
  {
    id: "nord",
    labelKey: "settings.theme.nord",
    dark: true,
    swatch: { background: "#2e3440", accent: "#88c0d0", foreground: "#d8dee9" },
  },
  {
    id: "gruvbox-dark-medium",
    labelKey: "settings.theme.gruvbox",
    dark: true,
    swatch: { background: "#282828", accent: "#fabd2f", foreground: "#ebdbb2" },
  },
  {
    id: "one-dark-pro",
    labelKey: "settings.theme.oneDark",
    dark: true,
    swatch: { background: "#282c34", accent: "#61afef", foreground: "#abb2bf" },
  },
  {
    id: "rose-pine",
    labelKey: "settings.theme.rosePine",
    dark: true,
    swatch: { background: "#191724", accent: "#ebbcba", foreground: "#e0def4" },
  },
  {
    id: "everforest-dark",
    labelKey: "settings.theme.everforest",
    dark: true,
    swatch: { background: "#2d353b", accent: "#a7c080", foreground: "#d3c6aa" },
  },
  {
    id: "kanagawa-wave",
    labelKey: "settings.theme.kanagawa",
    dark: true,
    swatch: { background: "#1f1f28", accent: "#7e9cd8", foreground: "#dcd7ba" },
  },
];

const roomThemeKey = (roomId: string) => `iris.room-theme.${roomId}`;

export function readRoomTheme(
  storage: Pick<Storage, "getItem">,
  roomId: string,
): WorkspaceTheme | null {
  try {
    const value = storage.getItem(roomThemeKey(roomId));
    return WORKSPACE_THEME_IDS.find((theme) => theme === value) ?? null;
  } catch {
    return null;
  }
}

export function writeRoomTheme(
  storage: Pick<Storage, "setItem">,
  roomId: string,
  theme: WorkspaceTheme,
): void {
  try {
    storage.setItem(roomThemeKey(roomId), theme);
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

export function isDarkWorkspaceTheme(theme: WorkspaceTheme): boolean {
  return WORKSPACE_THEME_OPTIONS.find((option) => option.id === theme)?.dark ?? false;
}

export function getHighlightsTheme(theme: WorkspaceTheme): Promise<Theme> {
  const validTheme = WORKSPACE_THEME_OPTIONS.some((option) => option.id === theme)
    ? theme
    : "paper";
  const cached = highlightsThemeCache.get(validTheme);
  if (cached) return cached;
  const loader = HIGHLIGHTS_THEME_LOADERS[validTheme] ?? HIGHLIGHTS_THEME_LOADERS.paper;
  const loaded = loader().then(({ default: loadedTheme }) => loadedTheme);
  highlightsThemeCache.set(validTheme, loaded);
  return loaded;
}

export function getRandomWorkspaceTheme(
  currentTheme: WorkspaceTheme,
  random: () => number = Math.random,
): WorkspaceTheme {
  const candidates = WORKSPACE_THEME_OPTIONS.filter((option) => option.id !== currentTheme);
  const index = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));
  return candidates[index]?.id ?? currentTheme;
}
