import { EditorView } from "@codemirror/view";
import type { ProjectSettings } from "@iris/shared";

import { isDarkWorkspaceTheme } from "./workspace-theme";

export function editorTheme(settings: ProjectSettings) {
  const theme = {
    "&": {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      minWidth: "0",
      color: "var(--ink)",
      backgroundColor: "var(--editor-surface)",
      fontFamily: `'${settings.fontFamily}', 'IBM Plex Mono', ui-monospace, monospace`,
      fontSize: `${settings.fontSize}px`,
      width: "100%",
    },
    "&.cm-focused": {
      outline: "none",
    },
    ".cm-scroller": {
      flex: "1 1 auto",
      minHeight: "0",
      minWidth: "0",
      overflow: "auto",
      fontFamily: "inherit",
      lineHeight: "1.75",
      padding: "0 0 32px",
    },
    ".cm-panel.cm-search": {
      backgroundColor: "var(--editor-surface)",
      color: "var(--ink)",
      fontFamily: "var(--mono-font)",
      fontSize: "11px",
    },
    ".cm-panels": {
      backgroundColor: "var(--editor-surface)",
      color: "var(--ink)",
    },
    ".cm-panels-bottom": {
      borderTop: "1px solid var(--divider)",
    },
    ".cm-vim-panel": {
      alignItems: "center",
      backgroundColor: "var(--editor-surface)",
      boxSizing: "border-box",
      color: "var(--muted)",
      display: "flex",
      gap: "12px",
      justifyContent: "space-between",
      fontFamily: "var(--mono-font)",
      fontSize: "10px",
      lineHeight: "22px",
      minHeight: "24px",
      padding: "0 12px",
    },
    ".cm-vim-panel input": {
      backgroundColor: "transparent",
      border: "none",
      caretColor: "var(--accent)",
      color: "var(--ink)",
      fontFamily: "inherit",
      fontSize: "inherit",
      minWidth: "0",
      outline: "none",
      width: "100%",
    },
    ".iris-editor-statusbar": {
      alignItems: "center",
      backgroundColor: "var(--editor-surface)",
      borderTop: "1px solid var(--divider)",
      boxSizing: "border-box",
      color: "var(--muted)",
      display: "flex",
      flex: "none",
      fontFamily: "var(--mono-font)",
      fontSize: "10px",
      gap: "12px",
      justifyContent: "space-between",
      lineHeight: "22px",
      minHeight: "24px",
      overflow: "hidden",
      padding: "0 12px",
      whiteSpace: "nowrap",
    },
    ".iris-editor-status-group": {
      alignItems: "center",
      display: "flex",
      gap: "12px",
      minWidth: "0",
    },
    ".iris-editor-status-leading": {
      overflow: "hidden",
    },
    ".iris-editor-status-mode": {
      color: "var(--ink)",
      flex: "none",
    },
    ".iris-editor-status-path": {
      minWidth: "0",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    ".iris-editor-status-command": {
      color: "var(--accent)",
      flex: "none",
    },
    ".iris-editor-status-trailing": {
      flex: "none",
      fontVariantNumeric: "tabular-nums",
    },
    ".cm-tooltip.cm-tooltip-autocomplete": {
      backgroundColor: "var(--editor-surface)",
      border: "1px solid var(--divider)",
      borderRadius: "6px",
      boxShadow: "0 8px 24px color-mix(in srgb, var(--ink-strong) 18%, transparent)",
      color: "var(--ink)",
      fontFamily: "var(--mono-font)",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul": {
      fontFamily: "inherit",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
      backgroundColor: "var(--editor-selection-surface)",
      boxShadow: "inset 2px 0 var(--accent)",
      color: "var(--ink)",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected] .cm-completionDetail": {
      color: "color-mix(in srgb, var(--ink-strong) 70%, var(--muted))",
    },
    ".cm-tooltip.cm-tooltip-autocomplete .cm-completionMatchedText": {
      color: "var(--accent-deep)",
    },
    ".cm-tooltip.cm-tooltip-hover": {
      backgroundColor: "var(--editor-surface)",
      border: "none",
    },
    ".cm-vim-search-status": {
      backgroundColor: "color-mix(in srgb, var(--accent) 12%, var(--editor-surface))",
      border: "1px solid color-mix(in srgb, var(--accent) 24%, var(--divider))",
      borderRadius: "4px",
      boxSizing: "border-box",
      color: "color-mix(in srgb, var(--ink) 72%, var(--muted))",
      display: "inline-block",
      fontFamily: "var(--mono-font)",
      fontSize: "10px",
      lineHeight: "14px",
      marginLeft: "10px",
      padding: "0 4px",
      pointerEvents: "none",
      whiteSpace: "pre",
    },
    ".cm-vim-search-count": {
      marginLeft: "8ch",
    },
    ".cm-panel.cm-search .cm-textfield": {
      backgroundColor: "color-mix(in srgb, var(--glass-popover) 72%, var(--editor-surface))",
      border: "1px solid var(--divider)",
      borderRadius: "6px",
      color: "var(--ink)",
      outline: "none",
      padding: "3px 6px",
    },
    ".cm-panel.cm-search .cm-textfield:focus": {
      borderColor: "var(--accent)",
      boxShadow: "0 0 0 2px color-mix(in srgb, var(--accent) 16%, transparent)",
    },
    ".cm-panel.cm-search .cm-textfield::placeholder": {
      color: "var(--muted)",
      opacity: "1",
    },
    ".cm-panel.cm-search .cm-button": {
      backgroundColor: "transparent",
      backgroundImage: "none",
      border: "1px solid transparent",
      borderRadius: "5px",
      color: "var(--accent-deep)",
      fontFamily: "var(--mono-font)",
      padding: "3px 6px",
    },
    ".cm-panel.cm-search .cm-button:hover": {
      backgroundColor: "color-mix(in srgb, var(--accent) 12%, transparent)",
      backgroundImage: "none",
      color: "var(--ink-strong)",
    },
    ".cm-panel.cm-search .cm-button:active": {
      backgroundColor: "color-mix(in srgb, var(--accent) 18%, transparent)",
      backgroundImage: "none",
      color: "var(--ink-strong)",
    },
    ".cm-panel.cm-search label": {
      alignItems: "center",
      color: "var(--muted)",
      display: "inline-flex",
      gap: "4px",
      lineHeight: "1.2",
      margin: "0 0.6em 0.2em 0",
      verticalAlign: "middle",
    },
    ".cm-panel.cm-search input[type=checkbox]": {
      accentColor: "var(--accent)",
      flex: "none",
      margin: "0",
    },
    ".cm-panel.cm-search [name=close]": {
      backgroundColor: "transparent",
      border: "none",
      color: "var(--muted)",
      fontSize: "16px",
      lineHeight: "1",
    },
    ".cm-panel.cm-search [name=close]:hover": {
      color: "var(--ink-strong)",
    },
    ".cm-panel.cm-panel-lint": {
      backgroundColor: "var(--editor-surface)",
      color: "var(--ink)",
    },
    ".cm-panel.cm-panel-lint ul [aria-selected], .cm-panel.cm-panel-lint ul:focus [aria-selected]":
      {
        backgroundColor: "var(--editor-selection-surface)",
        color: "var(--ink)",
      },
    ".cm-cursor, .cm-dropCursor": {
      marginLeft: "-1px",
      borderLeft: "1px solid var(--accent) !important",
    },
    ".cm-content": {
      caretColor: "var(--accent)",
      padding: "0 28px 0 0",
    },
    ".cm-content .cm-shiki span": {
      color: "inherit",
    },
    ".cm-gutters": {
      border: "none",
      backgroundColor: "var(--editor-surface)",
      color: "var(--text-dimmed)",
      minWidth: "56px",
      padding: "0 12px 0 0",
    },
    ".cm-gutterElement": {
      alignItems: "center",
      display: "flex",
      lineHeight: "inherit",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      justifyContent: "center",
    },
    ".cm-foldGutter": {
      minWidth: "24px",
    },
    ".cm-foldGutter .cm-gutterElement": {
      justifyContent: "center",
    },
    '.cm-foldGutter .cm-gutterElement > span[title="Fold line"]': {
      transform: "translateY(-2px)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: "var(--accent)",
    },
    ".cm-activeLine": {
      backgroundColor: "color-mix(in srgb, var(--accent) 8%, transparent)",
    },
    "&.cm-has-selection .cm-activeLine": {
      backgroundColor: "transparent",
    },
    ".cm-selectionBackground": {
      backgroundColor: "var(--editor-selection-surface)",
    },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
      backgroundColor: "var(--editor-selection-surface)",
    },
    ".cm-content::selection, .cm-content ::selection": {
      backgroundColor: "var(--editor-selection-surface)",
    },
    ".cm-searchMatch, .cm-selectionMatch": {
      backgroundColor: "var(--editor-selection-surface)",
    },
    ".cm-searchMatch-selected": {
      backgroundColor: "color-mix(in srgb, var(--accent) 24%, transparent)",
    },
    ".cm-searchMatch .cm-selectionMatch": {
      backgroundColor: "transparent",
    },
    "&.cm-focused .cm-matchingBracket": {
      backgroundColor: "var(--editor-selection-surface)",
    },
    "&.cm-focused .cm-nonmatchingBracket": {
      backgroundColor: "color-mix(in srgb, var(--accent) 18%, transparent)",
      textDecoration: "underline wavy var(--accent)",
    },
    ".cm-foldPlaceholder": {
      backgroundColor: "color-mix(in srgb, var(--accent) 8%, var(--editor-surface))",
      border: "1px solid var(--divider)",
      color: "var(--muted)",
    },
    ".cm-remote-selection": {
      backgroundColor: "color-mix(in srgb, var(--remote-color) 24%, transparent)",
    },
    ".cm-remote-cursor": {
      position: "relative",
      display: "inline-block",
      width: "0",
      height: "1.75em",
      verticalAlign: "text-bottom",
      borderLeft: "2px solid var(--remote-color)",
      pointerEvents: "none",
      zIndex: "3",
    },
    ".cm-remote-cursor-label": {
      position: "absolute",
      left: "-1px",
      bottom: "calc(100% - 2px)",
      zIndex: "4",
      display: "block",
      maxWidth: "160px",
      overflow: "hidden",
      padding: "3px 5px",
      borderRadius: "4px",
      color: "var(--editor-surface)",
      backgroundColor: "var(--remote-color)",
      fontFamily: "var(--mono-font)",
      fontSize: "9px",
      lineHeight: "1",
      whiteSpace: "nowrap",
      textOverflow: "ellipsis",
      transform: "translateY(-2px)",
    },
    ".cm-content .cm-remote-cursor-label": {
      color: "var(--editor-surface)",
    },
  };
  return EditorView.theme(theme, { dark: isDarkWorkspaceTheme(settings.theme) });
}
