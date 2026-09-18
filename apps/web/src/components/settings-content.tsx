import { useTranslation } from "react-i18next";
import { getSettingDefinition } from "../lib/settings-registry";
import type { SettingsDialogProps } from "./settings-types";
import type { PackageManager, ProjectSettings } from "@iris/shared";
import { languageOptions, type LanguageCode } from "../lib/i18n";
import { FontFamilyPicker, FontSizeSlider } from "./editor-settings-controls";
import { ThemePicker } from "./theme-picker";
import { RuntimeActions, SettingSelect, SettingSwitch } from "./settings-controls";
import { KeyboardSettings } from "./settings-keyboard";
import type { SettingsSection } from "./settings-types";
const packageManagers: PackageManager[] = ["pnpm", "npm", "yarn"];

export function SettingsContent(props: SettingsDialogProps & { section: SettingsSection }) {
  const { section, settings, onChange, onLanguageChange } = props;
  const { i18n, t } = useTranslation();
  const settingLabel = (id: string) => t(getSettingDefinition(id)?.labelKey ?? id);
  const settingDescription = (id: string) => {
    const key = getSettingDefinition(id)?.descriptionKey;
    return key ? t(key) : "";
  };
  return (
    <>
      {section === "workspace" && (
        <div className="grid gap-4">
          <SettingSelect
            settingId="language"
            label={settingLabel("language")}
            value={i18n.resolvedLanguage ?? "en"}
            onChange={(value) => {
              if (languageOptions.some((option) => option.code === value)) {
                onLanguageChange(value as LanguageCode);
              }
            }}
          >
            {languageOptions.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </SettingSelect>
          <div data-setting-id="theme">
            <ThemePicker
              value={settings.theme}
              onChange={(value) => onChange("theme", value as ProjectSettings["theme"])}
            />
          </div>
        </div>
      )}

      {section === "editor" && (
        <div className="grid gap-4">
          <div data-setting-id="fontFamily">
            <FontFamilyPicker
              label={t("settings.fontFamily")}
              value={settings.fontFamily}
              theme={settings.theme}
              onChange={(value) => onChange("fontFamily", value)}
            />
          </div>
          <div data-setting-id="fontSize">
            <FontSizeSlider
              label={t("settings.fontSize")}
              value={settings.fontSize}
              onChange={(value) => onChange("fontSize", value)}
            />
          </div>
          <SettingSwitch
            settingId="wordWrap"
            label={settingLabel("wordWrap")}
            description={settingDescription("wordWrap")}
            checked={settings.wordWrap}
            onCheckedChange={(checked) => onChange("wordWrap", checked)}
          />
          <SettingSwitch
            settingId="relativeLineNumbers"
            label={settingLabel("relativeLineNumbers")}
            description={settingDescription("relativeLineNumbers")}
            checked={settings.relativeLineNumbers}
            onCheckedChange={(checked) => onChange("relativeLineNumbers", checked)}
          />
          <SettingSelect
            settingId="normalCursorStyle"
            label={settingLabel("normalCursorStyle")}
            value={settings.normalCursorStyle}
            onChange={(value) =>
              onChange("normalCursorStyle", value as ProjectSettings["normalCursorStyle"])
            }
          >
            <option value="block">{t("settings.cursor.block")}</option>
            <option value="line">{t("settings.cursor.line")}</option>
            <option value="underline">{t("settings.cursor.underline")}</option>
            <option value="block-blink">{t("settings.cursor.blockBlink")}</option>
            <option value="line-blink">{t("settings.cursor.lineBlink")}</option>
            <option value="underline-blink">{t("settings.cursor.underlineBlink")}</option>
          </SettingSelect>
        </div>
      )}

      {section === "keyboard" && <KeyboardSettings {...props} />}
      {section === "runtime" && (
        <div className="grid gap-3">
          <SettingSelect
            settingId="packageManager"
            label={settingLabel("packageManager")}
            value={settings.packageManager}
            onChange={(value) => onChange("packageManager", value as PackageManager)}
          >
            {packageManagers.map((manager) => (
              <option key={manager} value={manager}>
                {manager}
              </option>
            ))}
          </SettingSelect>
          <SettingSwitch
            settingId="autoInstall"
            label={settingLabel("autoInstall")}
            description={settingDescription("autoInstall")}
            checked={settings.autoInstall}
            onCheckedChange={(checked) => onChange("autoInstall", checked)}
          />
          <SettingSwitch
            settingId="autoStartPreview"
            label={settingLabel("autoStartPreview")}
            description={settingDescription("autoStartPreview")}
            checked={settings.autoStartPreview}
            onCheckedChange={(checked) => onChange("autoStartPreview", checked)}
          />
          <div className="mt-2 rounded-lg border border-iris-divider bg-[color-mix(in_srgb,var(--canvas)_72%,transparent)] px-3 py-2.5 font-iris-mono text-[10px] leading-[1.5] text-iris-muted">
            {t("settings.runtimeNote", { manager: settings.packageManager })}
          </div>
          <RuntimeActions t={t} />
        </div>
      )}
    </>
  );
}
