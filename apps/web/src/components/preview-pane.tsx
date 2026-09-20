import { useRef } from "react";
import { RefreshCw } from "lucide-react";
import { IconButton } from "@radix-ui/themes";
import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { getLatestPreviewError, getPreviewRecoveryActions } from "../lib/preview-error-model";
import { getPreviewRunState } from "../lib/preview-runtime-model";
import { usePreviewRuntime } from "../lib/use-preview-runtime";
import { PreviewConsole } from "./preview-console";
import { PreviewError } from "./preview-error";
import { PreviewLoader } from "./preview-loader";
import type { PreviewPaneProps } from "./preview-pane.types";

export function PreviewPane(props: PreviewPaneProps) {
  const { file } = props;
  const { t } = useTranslation();
  const sectionRef = useRef<HTMLElement>(null);
  const {
    outputs,
    runtimeState,
    runtimeError,
    previewUrl,
    previewLoaded,
    previewLoadKey,
    fallbackDocument,
    previewBuildError,
    previewSourceLocation,
    hasSyntaxError,
    iframeRef,
    handlePreviewLoad,
    rerun,
    clearOutputs,
  } = usePreviewRuntime(props);
  const runState = getPreviewRunState(runtimeError, runtimeState);
  const headerLabel = previewUrl ?? t(`preview.${runState === "idle" ? "ready" : runState}`);
  const previewErrorMessage = previewBuildError
    ? (getLatestPreviewError(outputs) ?? previewBuildError)
    : undefined;
  const hasRuntime = props.files.some((item) => item.path === "package.json");
  const recoveryActions = getPreviewRecoveryActions(runtimeError, hasSyntaxError, hasRuntime);
  const showPreviewLoader =
    !runtimeError &&
    (runtimeState === "installing" ||
      runtimeState === "starting" ||
      (!previewUrl && !fallbackDocument && runtimeState === "idle") ||
      (Boolean(previewUrl) && !previewLoaded));
  const loaderLabel =
    runtimeState === "installing"
      ? t("preview.installing")
      : runtimeState === "starting"
        ? t("preview.starting")
        : t("app.waitingPreview");
  return (
    <motion.section
      ref={sectionRef}
      className="preview-panel glass-panel flex h-full min-h-0 flex-col overflow-hidden bg-iris-preview px-[6px] text-iris-ink"
      aria-label={t("preview.title")}
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <header className="glass-toolbar flex h-7 min-w-0 flex-none items-center justify-between gap-3 rounded-t-[14px] border border-iris-divider bg-[color-mix(in_srgb,var(--preview-surface)_92%,var(--ink))] px-2 py-0">
        <span
          className="min-w-0 flex-1 truncate font-iris-mono text-[8px] leading-tight text-iris-muted"
          title={headerLabel}
        >
          {headerLabel}
        </span>
        <IconButton asChild variant="ghost" color="gray" radius="medium">
          <motion.button
            className="box-border grid h-6 w-6 place-items-center rounded-[4px] border border-transparent bg-transparent p-0 text-iris-muted transition-colors duration-150 hover:text-iris-strong focus-visible:text-iris-strong focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[color-mix(in_srgb,var(--accent)_48%,transparent)] active:scale-[0.96]"
            type="button"
            onClick={rerun}
            aria-label={t("preview.run")}
            title={t("preview.run")}
            style={{
              backgroundColor: "transparent",
              boxSizing: "border-box",
              height: "24px",
              padding: 0,
              width: "24px",
            }}
            whileTap={{ scale: 0.96 }}
          >
            <RefreshCw width="11" height="11" />
          </motion.button>
        </IconButton>
      </header>
      <div className="relative min-h-[220px] flex-1 p-0 max-[760px]:min-h-0">
        <iframe
          key={`${previewLoadKey}-${previewUrl ? "runtime" : "fallback"}`}
          ref={iframeRef}
          title={`Preview of ${file.path}`}
          src={previewUrl}
          srcDoc={previewUrl ? undefined : fallbackDocument}
          sandbox={previewUrl ? "allow-scripts allow-same-origin" : "allow-scripts"}
          className="block h-full min-h-[260px] w-full border-0 bg-white shadow-none"
          onLoad={handlePreviewLoad}
        />
        <AnimatePresence initial={false}>
          {showPreviewLoader ? (
            <motion.div
              key="preview-loader"
              className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-[color-mix(in_srgb,var(--preview-surface)_96%,var(--accent)_4%)]"
              role="status"
              aria-live="polite"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14, ease: "easeOut" }}
            >
              <PreviewLoader label={loaderLabel} />
            </motion.div>
          ) : null}
        </AnimatePresence>
        {previewErrorMessage ? (
          <PreviewError
            message={previewErrorMessage}
            location={previewSourceLocation}
            onNavigateToSource={props.onNavigateToSource}
            recoveryActions={recoveryActions}
            onRetry={!hasRuntime && !hasSyntaxError ? rerun : undefined}
          />
        ) : null}
      </div>
      <PreviewConsole
        outputs={outputs}
        onClear={clearOutputs}
        getPreviewHeight={() => sectionRef.current?.getBoundingClientRect().height ?? 288}
      />
    </motion.section>
  );
}
