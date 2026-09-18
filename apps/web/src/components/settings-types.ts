import type { ProjectSettings } from "@iris/shared";
import type { KeyBinding } from "../lib/keymap";
import type { LanguageCode } from "../lib/i18n";

export type SettingsDialogProps = {
  settings: ProjectSettings;
  onChange: <K extends keyof ProjectSettings>(key: K, value: ProjectSettings[K]) => void;
  vimMode: boolean;
  onVimModeChange: (enabled: boolean) => void;
  keymap: KeyBinding[];
  onKeymapChange: (bindings: KeyBinding[]) => void;
  onLanguageChange: (language: LanguageCode) => void;
};

export type SettingsSection = "workspace" | "editor" | "keyboard" | "runtime";

export type NavigationEntry =
  | { kind: "section"; id: SettingsSection; label: string; description: string }
  | {
      kind: "setting";
      id: string;
      scope: SettingsSection;
      label: string;
      description: string;
    };
