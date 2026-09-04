import { Dices } from "lucide-react";
import { IconButton, Tooltip } from "@radix-ui/themes";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { WorkspaceTheme } from "@iris/shared";

import { getRandomWorkspaceTheme, WORKSPACE_THEME_OPTIONS } from "../lib/workspace-theme";

type ThemePickerProps = {
  value: WorkspaceTheme;
  onChange: (value: WorkspaceTheme) => void;
};

export function ThemePicker({ value, onChange }: ThemePickerProps) {
  const { t } = useTranslation();
  const [container, setContainer] = useState<HTMLFieldSetElement | null>(null);

  return (
    <fieldset ref={setContainer} className="relative z-20 grid gap-2 border-0 p-0">
      <legend className="flex w-full items-center justify-between gap-3 font-iris-mono text-[10px] uppercase tracking-[0.08em] text-iris-muted">
        <span>{t("settings.theme")}</span>
        <Tooltip container={container} content={t("settings.theme.random")}>
          <IconButton
            type="button"
            size="1"
            variant="ghost"
            color="gray"
            highContrast
            className="bg-transparent transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] focus-visible:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
            aria-label={t("settings.theme.random")}
            onClick={() => onChange(getRandomWorkspaceTheme(value))}
          >
            <Dices aria-hidden="true" size={13} strokeWidth={1.8} />
          </IconButton>
        </Tooltip>
      </legend>
      <div className="grid grid-cols-2 gap-2 max-[760px]:grid-cols-1" role="radiogroup">
        {WORKSPACE_THEME_OPTIONS.map((option) => {
          const selected = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-[background-color,border-color,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color-mix(in_srgb,var(--accent)_48%,transparent)] ${selected ? "border-[color-mix(in_srgb,var(--accent)_54%,var(--divider))] bg-[color-mix(in_srgb,var(--accent)_10%,var(--canvas))] shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent)_14%,transparent)]" : "border-iris-divider bg-[color-mix(in_srgb,var(--canvas)_72%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_30%,var(--divider))] hover:bg-[color-mix(in_srgb,var(--accent)_6%,var(--canvas))]"}`}
              onClick={() => onChange(option.id)}
            >
              <span
                className="relative grid h-7 w-7 shrink-0 place-items-center rounded-md border border-black/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]"
                style={{ backgroundColor: option.swatch.background }}
                aria-hidden="true"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: option.swatch.accent }}
                />
                <span
                  className="absolute bottom-1 left-1 h-0.5 w-3 rounded-full"
                  style={{ backgroundColor: option.swatch.foreground }}
                />
              </span>
              <span className="min-w-0 truncate font-iris-mono text-[10px] leading-tight text-iris-ink">
                {t(option.labelKey)}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
