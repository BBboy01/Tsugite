import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import type { LanguageCode } from "./i18n";
import { readKeymap, writeKeymap, type KeyBinding } from "./keymap";

export const VIM_MODE_STORAGE_KEY = "tsugite.vim-mode";

type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

export function readVimMode(storage: PreferenceStorage | undefined): boolean {
  return storage?.getItem(VIM_MODE_STORAGE_KEY) === "true";
}

export function writeVimMode(storage: PreferenceStorage | undefined, enabled: boolean): void {
  storage?.setItem(VIM_MODE_STORAGE_KEY, String(enabled));
}

export function useWorkspacePreferences() {
  const { i18n } = useTranslation();
  const [vimMode, setVimMode] = useState(() =>
    readVimMode(typeof window === "undefined" ? undefined : window.localStorage),
  );
  const [keymap, setKeymap] = useState<KeyBinding[]>(() => readKeymap());

  const updateVimMode = useCallback((enabled: boolean) => {
    setVimMode(enabled);
    writeVimMode(window.localStorage, enabled);
  }, []);

  const updateKeymap = useCallback((bindings: KeyBinding[]) => {
    setKeymap(bindings);
    writeKeymap(bindings);
  }, []);

  const updateLanguage = useCallback(
    (language: LanguageCode) => {
      void i18n.changeLanguage(language);
    },
    [i18n],
  );

  return { vimMode, keymap, updateVimMode, updateKeymap, updateLanguage };
}
