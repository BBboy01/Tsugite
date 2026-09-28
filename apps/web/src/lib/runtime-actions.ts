import type { TFunction } from "i18next";
import { RotateCcw, type LucideIcon } from "lucide-react";

export type RuntimeAction = "restart" | "reinstall";

const RUNTIME_ACTION_EVENT = "iris:runtime-action";
const RUNTIME_ACTION_COMPLETE_EVENT = "iris:runtime-action-complete";
type RuntimeActionListener = (action: RuntimeAction) => void;

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

export function dispatchRuntimeAction(action: RuntimeAction, target: EventTarget = window): void {
  dispatchRuntimeEvent(target, RUNTIME_ACTION_EVENT, action);
}

export function dispatchRuntimeActionComplete(
  action: RuntimeAction,
  target: EventTarget = window,
): void {
  dispatchRuntimeEvent(target, RUNTIME_ACTION_COMPLETE_EVENT, action);
}

export async function runRuntimeAction<T>(
  action: RuntimeAction,
  run: () => Promise<T>,
  target: EventTarget = window,
): Promise<T> {
  try {
    return await run();
  } finally {
    dispatchRuntimeActionComplete(action, target);
  }
}

export function subscribeRuntimeAction(
  listener: RuntimeActionListener,
  target: EventTarget = window,
): () => void {
  return subscribeRuntimeEvent(target, RUNTIME_ACTION_EVENT, listener);
}

export function subscribeRuntimeActionComplete(
  listener: RuntimeActionListener,
  target: EventTarget = window,
): () => void {
  return subscribeRuntimeEvent(target, RUNTIME_ACTION_COMPLETE_EVENT, listener);
}

function dispatchRuntimeEvent(target: EventTarget, eventName: string, action: RuntimeAction): void {
  target.dispatchEvent(new CustomEvent(eventName, { detail: { action } }));
}

function subscribeRuntimeEvent(
  target: EventTarget,
  eventName: string,
  listener: RuntimeActionListener,
): () => void {
  const handleEvent = (event: Event) => {
    const action = (event as CustomEvent<{ action?: unknown }>).detail?.action;
    if (action === "restart" || action === "reinstall") listener(action);
  };
  target.addEventListener(eventName, handleEvent);
  return () => target.removeEventListener(eventName, handleEvent);
}
