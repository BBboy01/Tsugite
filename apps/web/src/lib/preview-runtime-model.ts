import type { ProjectSettings } from "@iris/shared";
import type { RuntimeError, RuntimeState } from "./webcontainer-runtime";

export function getRuntimeSettingsKey(
  settings: Pick<ProjectSettings, "packageManager" | "autoInstall" | "autoStartPreview">,
): string {
  return `${settings.packageManager}:${settings.autoInstall}:${settings.autoStartPreview}`;
}

export function getPreviewRunState(
  runtimeError: RuntimeError | undefined,
  runtimeState: RuntimeState,
) {
  if (runtimeError || runtimeState === "error") return "error" as const;
  if (runtimeState === "installing") return "installing" as const;
  if (runtimeState === "starting") return "starting" as const;
  if (runtimeState === "paused") return "paused" as const;
  return "idle" as const;
}
