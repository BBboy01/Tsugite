import { Slider } from "@radix-ui/themes";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Autocomplete, useFilter } from "react-aria-components";

import type { WorkspaceTheme } from "@iris/shared";

import {
  EDITOR_FONT_SIZE_MAX,
  EDITOR_FONT_SIZE_MIN,
  filterEditorFonts,
} from "../lib/editor-settings";

import {
  Select,
  SelectEmpty,
  SelectGroup,
  SelectInput,
  SelectItem,
  SelectList,
  SelectPopover,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

type FontFamilyPickerProps = {
  label: string;
  value: string;
  theme: WorkspaceTheme;
  onChange: (value: string) => void;
};

export function FontFamilyPicker({ label, value, theme, onChange }: FontFamilyPickerProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const { contains } = useFilter({ sensitivity: "base" });
  const fonts = useMemo(
    () => filterEditorFonts("", value).map((font) => ({ label: font, value: font })),
    [value],
  );

  return (
    <div
      ref={containerRef}
      className="relative z-20 flex min-w-0 items-center justify-between gap-4 font-iris-mono text-[10px] uppercase tracking-[0.08em] text-iris-muted"
    >
      <span className="shrink-0">{label}</span>
      <Select
        aria-label={label}
        className="min-w-0 flex-1"
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        value={value}
        onChange={(nextValue) => {
          if (typeof nextValue === "string") onChange(nextValue);
        }}
      >
        <SelectTrigger className="h-8 min-w-0 border-iris-divider bg-[color-mix(in_srgb,var(--canvas)_68%,transparent)] px-2.5 py-0 text-iris-ink shadow-none ring-0 hover:bg-[color-mix(in_srgb,var(--accent)_8%,var(--canvas))] focus-visible:border-[color-mix(in_srgb,var(--accent)_42%,var(--divider))] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_18%,transparent)]">
          <SelectValue
            className="min-w-0 truncate text-xs normal-case tracking-normal"
            style={{ fontFamily: value }}
          />
        </SelectTrigger>
        <Autocomplete key={isOpen ? "open" : "closed"} filter={contains}>
          <SelectPopover
            UNSTABLE_portalContainer={containerRef.current ?? undefined}
            placement="bottom end"
            offset={6}
            className={`theme-${theme} glass-popover max-h-64 min-w-60 overflow-hidden rounded-lg border border-iris-divider text-iris-ink ring-0`}
          >
            <SelectInput
              aria-label={t("settings.font.search")}
              className="p-1.5 pb-1 [&_[data-slot=input-group]]:border-iris-divider [&_[data-slot=input-group]]:bg-[color-mix(in_srgb,var(--canvas)_78%,transparent)] [&_[data-slot=input-group]]:text-iris-ink [&_[data-slot=input-group]]:has-[[data-slot=input-group-control]:focus-visible]:border-[color-mix(in_srgb,var(--accent)_42%,var(--divider))] [&_[data-slot=input-group]]:has-[[data-slot=input-group-control]:focus-visible]:ring-2 [&_[data-slot=input-group]]:has-[[data-slot=input-group-control]:focus-visible]:ring-[color-mix(in_srgb,var(--accent)_18%,transparent)] [&_[data-slot=input-group-addon]]:text-iris-muted [&_[data-slot=input-group-control]]:text-[11px] [&_[data-slot=input-group-control]]:text-iris-ink [&_[data-slot=input-group-control]]:placeholder:text-iris-muted"
              placeholder={t("settings.font.search")}
            />
            <SelectList
              className="max-h-56 p-1"
              renderEmptyState={() => (
                <SelectEmpty className="py-4 font-iris-mono text-[10px] normal-case tracking-normal text-iris-muted">
                  {t("settings.font.empty")}
                </SelectEmpty>
              )}
            >
              <SelectGroup items={fonts} className="p-0">
                {(font) => (
                  <SelectItem
                    id={font.value}
                    textValue={font.label}
                    className="py-2 pr-8 pl-2 text-[11px] normal-case tracking-normal text-iris-ink focus:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] focus:text-[var(--accent-deep)] data-focused:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] data-focused:text-[var(--accent-deep)]"
                  >
                    <span className="truncate" style={{ fontFamily: font.value }}>
                      {font.label}
                    </span>
                  </SelectItem>
                )}
              </SelectGroup>
            </SelectList>
          </SelectPopover>
        </Autocomplete>
      </Select>
    </div>
  );
}

type FontSizeSliderProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
};

export function FontSizeSlider({ label, value, onChange }: FontSizeSliderProps) {
  return (
    <div className="grid grid-cols-[max-content_minmax(0,1fr)_max-content] items-center gap-x-3 gap-y-1 font-iris-mono text-[10px] uppercase tracking-[0.08em] text-iris-muted">
      <span className="shrink-0">{label}</span>
      <Slider
        className="min-w-0"
        min={EDITOR_FONT_SIZE_MIN}
        max={EDITOR_FONT_SIZE_MAX}
        step={1}
        value={[value]}
        aria-label={label}
        onValueChange={(nextValue) => {
          if (nextValue[0] !== undefined) onChange(nextValue[0]);
        }}
      />
      <output className="min-w-10 text-right text-xs font-medium normal-case tabular-nums tracking-normal text-[var(--accent-deep)]">
        {value}px
      </output>
      <div className="col-start-2 col-end-4 flex justify-between text-[9px] tabular-nums tracking-normal text-iris-muted">
        <span>{EDITOR_FONT_SIZE_MIN}px</span>
        <span>{EDITOR_FONT_SIZE_MAX}px</span>
      </div>
    </div>
  );
}
