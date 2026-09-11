import type { TFunction } from "i18next";
import { RotateCcw, type LucideIcon } from "lucide-react";

export type RuntimeAction = "restart" | "reinstall";

export const RUNTIME_ACTIONS: Array<{
  id: RuntimeAction;
  labelKey: string;
  pendingLabelKey: string;
  icon: LucideIcon;
}> = [
  {
    id: "restart",
    labelKey: "settings.runtimeRestart",
    pendingLabelKey: "settings.runtimeRestarting",
    icon: RotateCcw,
  },
  {
    id: "reinstall",
    labelKey: "settings.runtimeReinstall",
    pendingLabelKey: "settings.runtimeReinstalling",
    icon: RotateCcw,
  },
];

export function getRuntimeActionLabel(action: RuntimeAction, t: TFunction) {
  const definition = RUNTIME_ACTIONS.find((item) => item.id === action);
  return definition ? t(definition.labelKey) : action;
}

export function dispatchRuntimeAction(action: RuntimeAction) {
  window.dispatchEvent(new CustomEvent("iris:runtime-action", { detail: { action } }));
}
