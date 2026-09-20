import { FileCode, RefreshCw, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EditorLocation } from "../lib/editor-navigation";
import type { RuntimeAction } from "../lib/runtime-actions";
import { RuntimeActions } from "./settings-controls";

export function PreviewError({
  message,
  location,
  onNavigateToSource,
  recoveryActions = [],
  onRetry,
}: {
  message: string;
  location?: EditorLocation;
  onNavigateToSource?: (location: EditorLocation) => void;
  recoveryActions?: readonly RuntimeAction[];
  onRetry?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      className="absolute inset-0 z-20 flex min-h-0 flex-col gap-3 overflow-auto bg-[var(--preview-surface)] p-5 text-[var(--ink-strong)]"
      role="alert"
    >
      <div className="flex items-center gap-2 font-iris-mono text-[11px] text-[var(--accent-deep)]">
        <TriangleAlert width="13" height="13" />
        <span>{t("preview.errorTitle")}</span>
      </div>
      <pre className="m-0 whitespace-pre-wrap break-words font-iris-mono text-[10px] leading-[1.55] text-iris-ink">
        {message}
      </pre>
      {location && onNavigateToSource ? (
        <button
          type="button"
          className="flex min-h-9 items-center justify-center gap-2 rounded-lg border border-iris-divider bg-iris-canvas px-3 py-2 font-iris-mono text-[10px] text-iris-strong"
          onClick={() => onNavigateToSource(location)}
        >
          <FileCode size={13} aria-hidden="true" />
          {t("preview.goToSource")}
        </button>
      ) : null}
      {recoveryActions.length > 0 ? <RuntimeActions t={t} actions={recoveryActions} /> : null}
      {onRetry ? (
        <button
          type="button"
          className="flex min-h-9 items-center justify-center gap-2 rounded-lg border border-iris-divider bg-iris-canvas px-3 py-2 font-iris-mono text-[10px] text-iris-strong"
          onClick={onRetry}
        >
          <RefreshCw size={13} aria-hidden="true" />
          {t("preview.retry")}
        </button>
      ) : null}
    </div>
  );
}
