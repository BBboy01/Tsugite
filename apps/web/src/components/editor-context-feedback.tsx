import { useTranslation } from "react-i18next";
import type { EditorLocation } from "../lib/editor-navigation";
import { EditorPeek, type PeekResult } from "./editor-peek";

export type EditorContextError = "staleTarget" | "queryFailed" | "clipboardFailed";

type Props = {
  error: EditorContextError | null;
  peek: PeekResult | null;
  onDismissError: () => void;
  onClosePeek: () => void;
  onNavigate: (location: EditorLocation) => void;
};

export function EditorContextFeedback({
  error,
  peek,
  onDismissError,
  onClosePeek,
  onNavigate,
}: Props) {
  const { t } = useTranslation();

  return (
    <>
      {error && (
        <p
          role="alert"
          className="m-0 flex items-center justify-between gap-2 border-t border-iris-divider px-3 py-1 font-iris-mono text-xs text-iris-ink"
        >
          {t(`editor.context.${error}`)}
          <button type="button" className="text-iris-muted" onClick={onDismissError}>
            {t("editor.context.dismiss")}
          </button>
        </p>
      )}
      {peek && (
        <EditorPeek
          key={peek.title + peek.locations.map((item) => `${item.path}:${item.from}`).join(",")}
          result={peek}
          onClose={onClosePeek}
          onNavigate={onNavigate}
        />
      )}
    </>
  );
}
