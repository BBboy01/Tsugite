import { ExclamationTriangleIcon } from "@radix-ui/react-icons";
import { useTranslation } from "react-i18next";

export function PreviewError({ message }: { message: string }) {
  const { t } = useTranslation();

  return (
    <div
      className="absolute inset-0 z-20 flex min-h-0 flex-col gap-3 overflow-auto bg-[var(--preview-surface)] p-5 text-[var(--ink-strong)]"
      role="alert"
    >
      <div className="flex items-center gap-2 font-iris-mono text-[11px] text-[var(--accent-deep)]">
        <ExclamationTriangleIcon width="13" height="13" />
        <span>{t("preview.errorTitle")}</span>
      </div>
      <pre className="m-0 whitespace-pre-wrap break-words font-iris-mono text-[10px] leading-[1.55] text-iris-ink">
        {message}
      </pre>
    </div>
  );
}
