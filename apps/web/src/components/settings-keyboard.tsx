import { useTranslation } from "react-i18next";
import { getSettingDefinition } from "../lib/settings-registry";
import type { SettingsDialogProps } from "./settings-types";
import { useState } from "react";
import { IconButton } from "@radix-ui/themes";
import { RotateCcw } from "lucide-react";
import {
  DEFAULT_KEYMAP,
  findKeymapConflict,
  KEYMAP_ACTIONS,
  formatKeyBinding,
  normalizeKey,
  type AppAction,
} from "../lib/keymap";
import { useSystemClipboard } from "../lib/use-system-clipboard";
import { SettingSwitch } from "./settings-controls";
import { SettingSharingLabel } from "./setting-sharing-label";

export function KeyboardSettings({
  vimMode,
  onVimModeChange,
  keymap,
  onKeymapChange,
}: Pick<SettingsDialogProps, "vimMode" | "onVimModeChange" | "keymap" | "onKeymapChange">) {
  const { t } = useTranslation();
  const [systemClipboard, setSystemClipboard] = useSystemClipboard();
  const [keymapErrors, setKeymapErrors] = useState<Partial<Record<AppAction, string>>>({});
  const settingLabel = (id: string) => t(getSettingDefinition(id)?.labelKey ?? id);
  const settingDescription = (id: string) => {
    const key = getSettingDefinition(id)?.descriptionKey;
    return key ? t(key) : "";
  };
  return (
    <div className="grid gap-4">
      <SettingSwitch
        settingId="vimMode"
        label={settingLabel("vimMode")}
        description={settingDescription("vimMode")}
        checked={vimMode}
        onCheckedChange={onVimModeChange}
      />
      <SettingSwitch
        settingId="systemClipboard"
        label={settingLabel("systemClipboard")}
        description={settingDescription("systemClipboard")}
        checked={systemClipboard}
        onCheckedChange={setSystemClipboard}
      />
      {KEYMAP_ACTIONS.map((action) => {
        const labelKey =
          action === "file.search"
            ? "settings.fileSearchKeymap"
            : action === "settings.open"
              ? "settings.openKeymap"
              : action === "command.palette"
                ? "settings.commandPaletteKeymap"
                : "settings.previewConsoleKeymap";
        const binding = keymap.find((item) => item.action === action)?.key ?? "";
        const settingId =
          action === "file.search"
            ? "fileSearchKeymap"
            : action === "settings.open"
              ? "openSettingsKeymap"
              : action === "command.palette"
                ? "commandPaletteKeymap"
                : "previewConsoleKeymap";
        return (
          <label
            key={action}
            data-setting-id={settingId}
            className="grid gap-2 font-iris-mono text-[10px] uppercase tracking-[0.08em] text-iris-muted"
          >
            {t(labelKey)}
            <SettingSharingLabel settingId={settingId} />
            <div className="flex items-center gap-2">
              <input
                className="min-w-0 flex-1 rounded-lg border border-iris-divider bg-iris-canvas px-3 py-2 font-iris-mono text-xs normal-case tracking-normal text-iris-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color-mix(in_srgb,var(--accent)_36%,transparent)]"
                value={formatKeyBinding(binding)}
                readOnly
                onKeyDown={(event) => {
                  if (event.key === "Tab" || event.key === "Escape") return;
                  event.stopPropagation();
                  const key = normalizeKey(event.nativeEvent);
                  if (!key) return;
                  event.preventDefault();
                  const conflict = findKeymapConflict(keymap, action, key);
                  if (conflict) {
                    setKeymapErrors((current) => ({
                      ...current,
                      [action]: t("settings.keymapConflict", {
                        action: settingLabel(
                          conflict === "file.search"
                            ? "fileSearchKeymap"
                            : conflict === "settings.open"
                              ? "openSettingsKeymap"
                              : conflict === "command.palette"
                                ? "commandPaletteKeymap"
                                : "previewConsoleKeymap",
                        ),
                      }),
                    }));
                    return;
                  }
                  setKeymapErrors((current) => {
                    const next = { ...current };
                    delete next[action];
                    return next;
                  });
                  onKeymapChange(
                    KEYMAP_ACTIONS.map((item) => ({
                      action: item,
                      key:
                        item === action
                          ? key
                          : (keymap.find((candidate) => candidate.action === item)?.key ?? ""),
                    })),
                  );
                }}
                aria-label={t(labelKey)}
              />
              <IconButton
                size="1"
                variant="ghost"
                color="gray"
                type="button"
                aria-label={t("settings.resetKeymap")}
                title={t("settings.resetKeymap")}
                onClick={() => {
                  setKeymapErrors((current) => {
                    const next = { ...current };
                    delete next[action];
                    return next;
                  });
                  onKeymapChange(
                    KEYMAP_ACTIONS.map((item) => ({
                      action: item,
                      key:
                        item === action
                          ? DEFAULT_KEYMAP.find((candidate) => candidate.action === item)!.key
                          : (keymap.find((candidate) => candidate.action === item)?.key ?? ""),
                    })),
                  );
                }}
              >
                <RotateCcw width="13" height="13" />
              </IconButton>
            </div>
            {keymapErrors[action] && (
              <span className="text-[10px] normal-case tracking-normal text-rose-600" role="alert">
                {keymapErrors[action]}
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}
