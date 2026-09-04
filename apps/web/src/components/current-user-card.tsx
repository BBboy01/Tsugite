import { useEffect, useRef, useState } from "react";
import { CheckIcon, ColorWheelIcon } from "@radix-ui/react-icons";
import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";

import { AVATAR_COLORS } from "../lib/room-client";
import { getDisplayNameCommitValue } from "./current-user-name";

type CurrentUserCardProps = {
  displayName: string;
  color: string;
  onDisplayNameChange: (value: string) => boolean;
  onColorChange: (value: string) => boolean;
};

const colorLabels: Record<string, string> = {
  "#d88961": "Terracotta",
  "#7389b7": "Periwinkle",
  "#5d9f8c": "Sage",
  "#bc76a5": "Orchid",
};

export function CurrentUserCard({
  displayName,
  color,
  onDisplayNameChange,
  onColorChange,
}: CurrentUserCardProps) {
  const { t } = useTranslation();
  const [draftName, setDraftName] = useState(displayName);
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const colorMenuRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => setDraftName(displayName), [displayName]);

  const commitName = () => {
    const nextName = getDisplayNameCommitValue(draftName, displayName);
    if (nextName && onDisplayNameChange(nextName)) {
      setDraftName(nextName);
      return;
    }
    setDraftName(displayName);
  };

  return (
    <div className="flex min-w-0 items-center gap-[7px]">
      <details
        className="group relative shrink-0"
        ref={colorMenuRef}
        onToggle={(event) => setColorMenuOpen(event.currentTarget.open)}
      >
        <motion.summary
          className="grid h-[27px] w-[27px] cursor-pointer place-items-center rounded-full border-0 text-white shadow-[0_1px_3px_rgba(38,49,41,0.18)] transition-transform duration-150 hover:scale-[1.02] focus-visible:scale-[1.02] focus-visible:outline-2 focus-visible:outline-[color-mix(in_srgb,var(--accent)_36%,transparent)] [&::-webkit-details-marker]:hidden"
          style={{ backgroundColor: color }}
          aria-label={t("user.changeAvatarColor")}
          title={t("user.changeAvatarColor")}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.96 }}
        >
          <span className="font-iris-mono text-[10px] font-semibold">
            {getInitials(displayName)}
          </span>
        </motion.summary>
        <AnimatePresence initial={false}>
          {colorMenuOpen && (
            <motion.div
              className="glass-popover absolute bottom-[calc(100%+8px)] left-[-2px] z-[12] grid grid-cols-[repeat(5,24px)] gap-1.5 rounded-[9px] border border-iris-divider bg-iris-preview p-2 shadow-[0_12px_28px_rgba(65,66,45,0.16)]"
              role="group"
              aria-label={t("user.avatarColors")}
              initial={{ opacity: 0, y: 6, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.94 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
            >
              {AVATAR_COLORS.map((option) => (
                <motion.button
                  className={`grid h-6 w-6 cursor-pointer place-items-center rounded-full border-2 border-transparent text-white hover:border-iris-strong focus-visible:border-iris-strong focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[color-mix(in_srgb,var(--accent)_48%,transparent)] ${option === color ? "border-iris-strong" : ""}`}
                  key={option}
                  type="button"
                  style={{ backgroundColor: option }}
                  aria-label={colorLabel(option, t)}
                  title={colorLabel(option, t)}
                  onClick={() => {
                    onColorChange(option);
                    if (colorMenuRef.current) colorMenuRef.current.open = false;
                  }}
                  whileHover={{ scale: 1.14 }}
                  whileTap={{ scale: 0.96 }}
                >
                  {option === color && <CheckIcon width="12" height="12" />}
                </motion.button>
              ))}
              <label
                className="relative grid h-6 w-6 cursor-pointer place-items-center overflow-hidden rounded-full border-2 border-iris-divider bg-[conic-gradient(#d88961,#7389b7,#5d9f8c,#bc76a5,#d88961)] text-white hover:border-iris-strong focus-within:border-iris-strong"
                title={t("user.customColor")}
              >
                <input
                  className="absolute h-full w-full cursor-pointer opacity-0"
                  type="color"
                  value={isHexColor(color) ? color : AVATAR_COLORS[0]}
                  aria-label={t("user.customColor")}
                  onChange={(event) => onColorChange(event.target.value)}
                />
                <span aria-hidden="true">
                  <ColorWheelIcon width="12" height="12" />
                </span>
              </label>
            </motion.div>
          )}
        </AnimatePresence>
      </details>

      <div className="min-w-0 flex-1">
        <input
          className="w-full min-w-0 rounded-[5px] border border-transparent bg-transparent px-1 py-0.5 font-iris-mono text-base leading-tight text-iris-strong outline-2 outline-transparent outline-offset-1 transition-[border-color,outline-color] duration-150 hover:border-iris-divider focus:border-[var(--accent)] focus:outline-[color-mix(in_srgb,var(--accent)_28%,transparent)] min-[760px]:text-[10px]"
          value={draftName}
          maxLength={32}
          aria-label={t("user.editName")}
          onChange={(event) => setDraftName(event.target.value)}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitName();
              event.currentTarget.blur();
            }
            if (event.key === "Escape") {
              setDraftName(displayName);
              event.currentTarget.blur();
            }
          }}
        />
      </div>
    </div>
  );
}

function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function colorLabel(color: string, translate: (key: string) => string): string {
  const key = colorLabels[color];
  return key ? translate(`user.color.${key.toLowerCase()}`) : color;
}
