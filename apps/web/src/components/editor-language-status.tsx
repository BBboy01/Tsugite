import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectDeclarations } from "../lib/room-typescript-intelligence";

export function EditorLanguageStatus({ declarations }: { declarations: ProjectDeclarations }) {
  const { t } = useTranslation();
  const state = useSyncExternalStore(
    declarations.subscribeDeclarations,
    declarations.getDeclarationsStatus,
    declarations.getDeclarationsStatus,
  );
  const service = useSyncExternalStore(
    declarations.subscribeServiceStatus,
    declarations.getServiceStatus,
    declarations.getServiceStatus,
  );
  const unavailable = service.state === "unavailable";
  if (!unavailable && state.status === "ready" && service.state !== "loading") return null;
  const reason = unavailable
    ? service.reason
    : state.status === "unavailable"
      ? state.reason
      : undefined;
  const message = unavailable
    ? "editor.languageUnavailable"
    : service.state === "loading"
      ? "editor.languageLoading"
      : state.status === "loading"
        ? "editor.typesLoading"
        : "editor.typesUnavailable";
  return (
    <div
      role="status"
      data-typescript-status={unavailable ? "unavailable" : state.status}
      title={reason}
      className="flex min-h-6 flex-none items-center border-b border-iris-divider px-3 py-1 font-iris-mono text-[10px] leading-4 text-iris-muted"
    >
      {t(message)}
    </div>
  );
}
