import * as Dialog from "@radix-ui/react-dialog";
import { CodeIcon, ColorWheelIcon, Cross2Icon, GearIcon, RocketIcon } from "@radix-ui/react-icons";
import { IconButton, Switch, Theme } from "@radix-ui/themes";
import { motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { PackageManager, ProjectSettings } from "@iris/shared";

import { languageOptions, type LanguageCode } from "../lib/i18n";
import { isDarkWorkspaceTheme } from "../lib/workspace-theme";

import { FontFamilyPicker, FontSizeSlider } from "./editor-settings-controls";
import { ThemePicker } from "./theme-picker";

export const SETTINGS_DIALOG_THEME_CLASS_NAME = "settings-dialog-theme";

type SettingsDialogProps = {
  settings: ProjectSettings;
  onChange: <K extends keyof ProjectSettings>(key: K, value: ProjectSettings[K]) => void;
};

type SettingsSection = "style" | "editor" | "runtime";

const packageManagers: PackageManager[] = ["pnpm", "npm", "yarn"];

export function SettingsPopover({ settings, onChange }: SettingsDialogProps) {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<SettingsSection>("style");

  const sections: Array<{ id: SettingsSection; icon: typeof CodeIcon; label: string }> = [
    { id: "style", icon: ColorWheelIcon, label: t("settings.nav.style") },
    { id: "editor", icon: CodeIcon, label: t("settings.nav.editor") },
    { id: "runtime", icon: RocketIcon, label: t("settings.nav.runtime") },
  ];

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <motion.button
          className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg border-0 bg-transparent p-0 text-iris-muted transition-[background-color,color,box-shadow] duration-150 hover:bg-[color-mix(in_srgb,var(--glass-popover)_88%,transparent)] hover:text-iris-strong hover:shadow-[0_2px_8px_color-mix(in_srgb,var(--ink-strong)_12%,transparent)] focus-visible:bg-[color-mix(in_srgb,var(--glass-popover)_88%,transparent)] focus-visible:text-iris-strong focus-visible:outline-2 focus-visible:outline-[color-mix(in_srgb,var(--accent)_36%,transparent)]"
          type="button"
          aria-label={t("settings.open")}
          title={t("settings.open")}
          whileTap={{ scale: 0.97 }}
        >
          <GearIcon width="14" height="14" />
        </motion.button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Theme
          appearance={isDarkWorkspaceTheme(settings.theme) ? "dark" : "light"}
          accentColor="blue"
          grayColor="gray"
          hasBackground={false}
          radius="medium"
          scaling="100%"
          className={SETTINGS_DIALOG_THEME_CLASS_NAME}
        >
          <Dialog.Overlay className="glass-overlay settings-overlay fixed inset-0 z-50" />
          <Dialog.Content
            className={`theme-${settings.theme} glass-dialog fixed left-1/2 top-1/2 z-50 grid h-[min(78vh,560px)] w-[min(92vw,760px)] -translate-x-1/2 -translate-y-1/2 grid-cols-[180px_minmax(0,1fr)] overflow-visible rounded-[14px] border border-iris-divider bg-iris-preview text-iris-ink shadow-[0_24px_70px_rgba(38,49,41,0.22)] focus:outline-none max-[760px]:h-[min(86vh,680px)] max-[760px]:w-[min(94vw,560px)] max-[760px]:grid-cols-1 max-[760px]:grid-rows-[auto_minmax(0,1fr)]`}
          >
            <aside className="settings-sidebar-glass flex min-h-0 flex-col rounded-l-[14px] border-r border-iris-divider p-3 max-[760px]:rounded-l-none max-[760px]:rounded-t-[14px] max-[760px]:flex-row max-[760px]:items-center max-[760px]:gap-1 max-[760px]:overflow-x-auto max-[760px]:border-b max-[760px]:border-r-0">
              <div className="mb-5 px-2 max-[760px]:mb-0 max-[760px]:mr-2 max-[760px]:shrink-0">
                <p className="m-0 font-iris-mono text-[9px] uppercase tracking-[0.13em] text-iris-muted">
                  {t("settings.title")}
                </p>
                <h2 className="m-[5px_0_0] font-serif text-[18px] font-medium leading-tight text-iris-strong max-[760px]:hidden">
                  {t("settings.workspaceTone")}
                </h2>
              </div>
              <nav className="grid gap-1 max-[760px]:flex max-[760px]:min-w-max">
                {sections.map(({ id, icon: Icon, label }) => (
                  <button
                    className={`flex h-9 items-center gap-2 rounded-lg border-0 px-2.5 text-left font-iris-mono text-[11px] transition-[background-color,color] duration-150 ${section === id ? "bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent-deep)]" : "bg-transparent text-iris-muted hover:bg-white/35 hover:text-iris-strong"}`}
                    key={id}
                    type="button"
                    aria-current={section === id ? "page" : undefined}
                    onClick={() => setSection(id)}
                  >
                    <Icon width="14" height="14" />
                    {label}
                  </button>
                ))}
              </nav>
            </aside>

            <div className="flex min-h-0 flex-col rounded-r-[14px] max-[760px]:rounded-r-none max-[760px]:rounded-b-[14px]">
              <div className="flex items-start justify-between gap-4 border-b border-iris-divider px-5 py-4 max-[760px]:px-4">
                <div>
                  <Dialog.Title className="font-serif text-[20px] font-medium leading-tight text-iris-strong">
                    {t(`settings.section.${section}.title`)}
                  </Dialog.Title>
                  <Dialog.Description className="mt-1 font-iris-mono text-[10px] leading-tight text-iris-muted">
                    {t(`settings.section.${section}.description`)}
                  </Dialog.Description>
                </div>
                <Dialog.Close asChild>
                  <IconButton
                    size="1"
                    variant="ghost"
                    color="gray"
                    aria-label={t("settings.close")}
                    title={t("settings.close")}
                  >
                    <Cross2Icon width="15" height="15" />
                  </IconButton>
                </Dialog.Close>
              </div>

              <div className="min-h-0 flex-1 overflow-auto px-5 py-5 max-[760px]:px-4">
                {section === "style" && (
                  <div className="grid gap-4">
                    <SettingSelect
                      label={t("settings.language")}
                      value={i18n.resolvedLanguage ?? "en"}
                      onChange={(value) => {
                        if (languageOptions.some((option) => option.code === value)) {
                          void i18n.changeLanguage(value as LanguageCode);
                        }
                      }}
                    >
                      {languageOptions.map((option) => (
                        <option key={option.code} value={option.code}>
                          {option.label}
                        </option>
                      ))}
                    </SettingSelect>
                    <ThemePicker
                      value={settings.theme}
                      onChange={(value) => onChange("theme", value as ProjectSettings["theme"])}
                    />
                  </div>
                )}

                {section === "editor" && (
                  <div className="grid gap-4">
                    <FontFamilyPicker
                      label={t("settings.fontFamily")}
                      value={settings.fontFamily}
                      theme={settings.theme}
                      onChange={(value) => onChange("fontFamily", value)}
                    />
                    <FontSizeSlider
                      label={t("settings.fontSize")}
                      value={settings.fontSize}
                      onChange={(value) => onChange("fontSize", value)}
                    />
                    <SettingSwitch
                      label={t("settings.wordWrap")}
                      description={t("settings.wordWrapDescription")}
                      checked={settings.wordWrap}
                      onCheckedChange={(checked) => onChange("wordWrap", checked)}
                    />
                  </div>
                )}

                {section === "runtime" && (
                  <div className="grid gap-3">
                    <SettingSelect
                      label={t("settings.packageManager")}
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
                      label={t("settings.autoInstall")}
                      description={t("settings.autoInstallDescription")}
                      checked={settings.autoInstall}
                      onCheckedChange={(checked) => onChange("autoInstall", checked)}
                    />
                    <SettingSwitch
                      label={t("settings.autoStartPreview")}
                      description={t("settings.autoStartPreviewDescription")}
                      checked={settings.autoStartPreview}
                      onCheckedChange={(checked) => onChange("autoStartPreview", checked)}
                    />
                    <div className="mt-2 rounded-lg border border-iris-divider bg-[color-mix(in_srgb,var(--canvas)_72%,transparent)] px-3 py-2.5 font-iris-mono text-[10px] leading-[1.5] text-iris-muted">
                      {t("settings.runtimeNote", { manager: settings.packageManager })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Dialog.Content>
        </Theme>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SettingSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex min-w-0 items-center justify-between gap-4 font-iris-mono text-[10px] uppercase tracking-[0.08em] text-iris-muted">
      <span className="shrink-0">{label}</span>
      <select
        className="min-w-0 flex-1 rounded-lg border border-iris-divider bg-iris-canvas px-3 py-2.5 text-xs normal-case tracking-normal text-iris-ink outline-2 outline-[color-mix(in_srgb,var(--accent)_36%,transparent)] outline-offset-1"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

function SettingSwitch({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-iris-divider bg-[color-mix(in_srgb,var(--canvas)_72%,transparent)] px-3 py-3">
      <div className="min-w-0">
        <p className="m-0 font-iris-mono text-xs text-iris-strong">{label}</p>
        <p className="m-[4px_0_0] font-iris-mono text-[10px] leading-[1.4] text-iris-muted">
          {description}
        </p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  );
}
