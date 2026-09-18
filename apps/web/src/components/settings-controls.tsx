import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Switch } from "@radix-ui/themes";
import { dispatchRuntimeAction, RUNTIME_ACTIONS, type RuntimeAction } from "../lib/runtime-actions";

export function RuntimeActions({ t }: { t: (key: string) => string }) {
  const [pending, setPending] = useState<RuntimeAction | undefined>();

  useEffect(() => {
    const handleComplete = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: RuntimeAction }>).detail;
      if (detail.action === pending) setPending(undefined);
    };
    window.addEventListener("iris:runtime-action-complete", handleComplete);
    return () => window.removeEventListener("iris:runtime-action-complete", handleComplete);
  }, [pending]);

  const run = (action: RuntimeAction, button: HTMLButtonElement) => {
    if (pending) return;
    setPending(action);
    dispatchRuntimeAction(action);
    requestAnimationFrame(() => button.focus());
  };

  return (
    <div className="grid gap-2 border-t border-iris-divider pt-3">
      {RUNTIME_ACTIONS.map((action) => (
        <button
          data-setting-id={action.id === "restart" ? "runtimeRestart" : "runtimeReinstall"}
          className="flex min-h-9 items-center justify-center gap-2 rounded-lg border border-iris-divider bg-iris-canvas px-3 py-2 font-iris-mono text-[10px] text-iris-strong transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_8%,var(--canvas))] disabled:cursor-wait disabled:opacity-55"
          key={action.id}
          type="button"
          disabled={Boolean(pending) && pending !== action.id}
          aria-label={t(action.labelKey)}
          title={t(action.labelKey)}
          onClick={(event) => run(action.id, event.currentTarget)}
        >
          <action.icon
            width="13"
            height="13"
            className={pending === action.id ? "animate-spin" : undefined}
          />
          {pending === action.id ? t(action.pendingLabelKey) : t(action.labelKey)}
        </button>
      ))}
    </div>
  );
}

export function SettingSelect({
  settingId,
  label,
  value,
  onChange,
  children,
}: {
  settingId?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label
      data-setting-id={settingId}
      className="flex min-w-0 items-center justify-between gap-4 font-iris-mono text-[10px] uppercase tracking-[0.08em] text-iris-muted"
    >
      <span className="shrink-0">{label}</span>
      <span className="relative min-w-0 flex-1">
        <select
          className="w-full appearance-none rounded-lg border border-iris-divider bg-iris-canvas px-3 py-2.5 pr-10 text-base normal-case tracking-normal text-iris-ink outline-none focus-visible:outline-2 focus-visible:outline-[color-mix(in_srgb,var(--accent)_72%,white)] focus-visible:outline-offset-2 min-[760px]:text-xs"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-iris-muted"
          width="14"
          height="14"
        />
      </span>
    </label>
  );
}

export function SettingSwitch({
  settingId,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  settingId?: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div
      data-setting-id={settingId}
      className="flex items-center justify-between gap-4 rounded-lg border border-iris-divider bg-[color-mix(in_srgb,var(--canvas)_72%,transparent)] px-3 py-3"
    >
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
