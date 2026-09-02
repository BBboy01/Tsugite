import type { WorkspaceTheme } from "@iris/shared";

import type { ShikiTheme } from "./shiki-highlighting";

export type WorkspaceThemeOption = {
  id: WorkspaceTheme;
  labelKey: string;
  dark: boolean;
  shiki: ShikiTheme;
  swatch: {
    background: string;
    accent: string;
    foreground: string;
  };
};

export const WORKSPACE_THEME_OPTIONS: readonly WorkspaceThemeOption[] = [
  {
    id: "paper",
    labelKey: "settings.paperLight",
    dark: false,
    shiki: "vitesse-light",
    swatch: { background: "#f5f5f7", accent: "#007aff", foreground: "#1d1d1f" },
  },
  {
    id: "github-light",
    labelKey: "settings.theme.githubLight",
    dark: false,
    shiki: "github-light",
    swatch: { background: "#ffffff", accent: "#0969da", foreground: "#1f2328" },
  },
  {
    id: "solarized-light",
    labelKey: "settings.theme.solarizedLight",
    dark: false,
    shiki: "solarized-light",
    swatch: { background: "#fdf6e3", accent: "#268bd2", foreground: "#073642" },
  },
  {
    id: "catppuccin-latte",
    labelKey: "settings.theme.catppuccinLatte",
    dark: false,
    shiki: "catppuccin-latte",
    swatch: { background: "#eff1f5", accent: "#1e66f5", foreground: "#4c4f69" },
  },
  {
    id: "ink",
    labelKey: "settings.inkDark",
    dark: true,
    shiki: "vitesse-dark",
    swatch: { background: "#1c1c1e", accent: "#ff9f0a", foreground: "#f5f5f7" },
  },
  {
    id: "github-dark",
    labelKey: "settings.theme.githubDark",
    dark: true,
    shiki: "github-dark",
    swatch: { background: "#0d1117", accent: "#58a6ff", foreground: "#e6edf3" },
  },
  {
    id: "solarized-dark",
    labelKey: "settings.theme.solarizedDark",
    dark: true,
    shiki: "solarized-dark",
    swatch: { background: "#002b36", accent: "#2aa198", foreground: "#839496" },
  },
  {
    id: "tokyo-night",
    labelKey: "settings.theme.tokyoNight",
    dark: true,
    shiki: "tokyo-night",
    swatch: { background: "#1a1b26", accent: "#7aa2f7", foreground: "#c0caf5" },
  },
  {
    id: "dracula",
    labelKey: "settings.theme.dracula",
    dark: true,
    shiki: "dracula",
    swatch: { background: "#282a36", accent: "#bd93f9", foreground: "#f8f8f2" },
  },
  {
    id: "catppuccin-mocha",
    labelKey: "settings.theme.catppuccinMocha",
    dark: true,
    shiki: "catppuccin-mocha",
    swatch: { background: "#1e1e2e", accent: "#cba6f7", foreground: "#cdd6f4" },
  },
  {
    id: "nord",
    labelKey: "settings.theme.nord",
    dark: true,
    shiki: "nord",
    swatch: { background: "#2e3440", accent: "#88c0d0", foreground: "#d8dee9" },
  },
  {
    id: "gruvbox-dark-medium",
    labelKey: "settings.theme.gruvbox",
    dark: true,
    shiki: "gruvbox-dark-medium",
    swatch: { background: "#282828", accent: "#fabd2f", foreground: "#ebdbb2" },
  },
  {
    id: "one-dark-pro",
    labelKey: "settings.theme.oneDark",
    dark: true,
    shiki: "one-dark-pro",
    swatch: { background: "#282c34", accent: "#61afef", foreground: "#abb2bf" },
  },
  {
    id: "rose-pine",
    labelKey: "settings.theme.rosePine",
    dark: true,
    shiki: "rose-pine",
    swatch: { background: "#191724", accent: "#ebbcba", foreground: "#e0def4" },
  },
  {
    id: "everforest-dark",
    labelKey: "settings.theme.everforest",
    dark: true,
    shiki: "everforest-dark",
    swatch: { background: "#2d353b", accent: "#a7c080", foreground: "#d3c6aa" },
  },
  {
    id: "kanagawa-wave",
    labelKey: "settings.theme.kanagawa",
    dark: true,
    shiki: "kanagawa-wave",
    swatch: { background: "#1f1f28", accent: "#7e9cd8", foreground: "#dcd7ba" },
  },
];

export function isDarkWorkspaceTheme(theme: WorkspaceTheme): boolean {
  return WORKSPACE_THEME_OPTIONS.find((option) => option.id === theme)?.dark ?? false;
}

export function getShikiTheme(theme: WorkspaceTheme): ShikiTheme {
  return WORKSPACE_THEME_OPTIONS.find((option) => option.id === theme)?.shiki ?? "vitesse-light";
}

export function getRandomWorkspaceTheme(
  currentTheme: WorkspaceTheme,
  random: () => number = Math.random,
): WorkspaceTheme {
  const candidates = WORKSPACE_THEME_OPTIONS.filter((option) => option.id !== currentTheme);
  const index = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));
  return candidates[index]?.id ?? currentTheme;
}
