import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import type { EditorIntelligenceService } from "../lib/room-typescript-intelligence";

export function EditorLanguageStatus({
  serviceStatus,
}: {
  serviceStatus: EditorIntelligenceService;
}) {
  const { t } = useTranslation();
  const service = useSyncExternalStore(
    serviceStatus.subscribeServiceStatus,
    serviceStatus.getServiceStatus,
    serviceStatus.getServiceStatus,
  );
  if (service.state === "ready" || service.state === "disposed") return null;
  const message =
    service.state === "unavailable"
      ? "editor.languageUnavailable"
      : service.state === "fallback"
        ? "editor.languageFallback"
        : "editor.languageLoading";
  return (
    <div
      role="status"
      data-typescript-status={service.state}
      title={service.reason}
      className="flex min-h-6 flex-none items-center border-b border-iris-divider px-3 py-1 font-iris-mono text-[10px] leading-4 text-iris-muted"
    >
      {t(message)}
    </div>
  );
}
