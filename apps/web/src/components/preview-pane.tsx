import { useEffect, useRef, useState } from "react";
import { ReloadIcon } from "@radix-ui/react-icons";
import { IconButton } from "@radix-ui/themes";
import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";
import type { ProjectFile, ProjectSettings } from "@iris/shared";
import type { PreviewOutput } from "../lib/preview-runner";
import {
  type RuntimeError,
  type RuntimeEvent,
  type RuntimeState,
} from "../lib/webcontainer-runtime";
import { PreviewConsole } from "./preview-console";
import { PreviewLoader } from "./preview-loader";
type PreviewPaneProps = {
  file: ProjectFile;
  files: ProjectFile[];
  folders: string[];
  settings: ProjectSettings;
};
type WebContainerRuntimeInstance = import("../lib/webcontainer-runtime").WebContainerRuntime;
export function PreviewPane({ file, files, folders, settings }: PreviewPaneProps) {
  const { t } = useTranslation();
  const sectionRef = useRef<HTMLElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [outputs, setOutputs] = useState<PreviewOutput[]>([]);
  const [runtimeState, setRuntimeState] = useState<RuntimeState>("idle");
  const [runtimeError, setRuntimeError] = useState<RuntimeError | undefined>();
  const [previewUrl, setPreviewUrl] = useState<string | undefined>();
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [previewLoadKey, setPreviewLoadKey] = useState(0);
  const [fallbackDocument, setFallbackDocument] = useState("");
  const [runKey, setRunKey] = useState(0);
  const runtimeRef = useRef<WebContainerRuntimeInstance | undefined>(undefined);
  const runtimeStartedRef = useRef(false);
  const lastRunKeyRef = useRef(runKey);
  const lastRuntimeSettingsKeyRef = useRef("");
  const latestProjectRef = useRef({ files, folders });
  const translateRef = useRef(t);
  const runtimeEventRef = useRef<(event: RuntimeEvent) => void>(() => undefined);
  const stableRuntimeHandlerRef = useRef((event: RuntimeEvent) => runtimeEventRef.current(event));
  latestProjectRef.current = { files, folders };
  translateRef.current = t;
  useEffect(() => {
    const handleMessage = (event: MessageEvent<PreviewOutput & { source?: string }>) => {
      if (event.source !== iframeRef.current?.contentWindow || event.data.source !== "iris-preview")
        return;
      setOutputs((current) =>
        [...current, { level: event.data.level, message: event.data.message }].slice(-80),
      );
      if (event.data.level === "error") setRuntimeState("error");
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);
  useEffect(() => {
    return () => runtimeRef.current?.dispose();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const packageFile = files.find((item) => item.path === "package.json");
    if (!packageFile) {
      const fallbackTimer = setTimeout(() => {
        void (async () => {
          try {
            const { createPreviewDocument, runPreview } = await import("../lib/preview-runner");
            if (cancelled) return;
            const result = runPreview(file.text.toString(), file.language);
            if (cancelled) return;
            if (result.error) {
              setFallbackDocument("");
              setOutputs([{ level: "error", message: result.error }]);
              setRuntimeState("error");
              return;
            }
            setFallbackDocument(createPreviewDocument(result.code ?? ""));
          } catch (error) {
            if (cancelled) return;
            setFallbackDocument("");
            setOutputs([
              {
                level: "error",
                message: error instanceof Error ? error.message : String(error),
              },
            ]);
            setRuntimeState("error");
          }
        })();
      }, 250);
      runtimeRef.current?.dispose();
      runtimeStartedRef.current = false;
      setRuntimeState("idle");
      setRuntimeError(undefined);
      setPreviewLoaded(false);
      setPreviewUrl(undefined);
      return () => {
        cancelled = true;
        clearTimeout(fallbackTimer);
      };
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const setupRuntime = async () => {
      if (!runtimeRef.current) {
        const { WebContainerRuntime } = await import("../lib/webcontainer-runtime");
        if (cancelled) return;
        runtimeRef.current = new WebContainerRuntime();
      }
      const runtime = runtimeRef.current;
      if (!runtime || cancelled) return;
      const onRuntimeEvent = (event: RuntimeEvent) => {
        if (cancelled) return;
        if (event.type === "output") {
          setOutputs((current) => [...current, event].slice(-80));
          return;
        }
        if (event.type === "server-ready") {
          setPreviewLoaded(false);
          setPreviewUrl(event.url);
          return;
        }
        setRuntimeState(event.state);
        setRuntimeError(event.error);
        if (event.error) {
          setPreviewLoaded(false);
          setPreviewUrl(undefined);
          setOutputs((current) =>
            [
              ...current,
              {
                level: "error" as const,
                message: translateRef.current(`preview.runtime.${event.error}`),
              },
            ].slice(-80),
          );
        }
      };
      runtimeEventRef.current = onRuntimeEvent;
      timer = setTimeout(() => {
        const runtimeSettingsKey = `${settings.packageManager}:${settings.autoInstall}:${settings.autoStartPreview}`;
        if (!runtimeStartedRef.current) {
          runtimeStartedRef.current = true;
          lastRunKeyRef.current = runKey;
          lastRuntimeSettingsKeyRef.current = runtimeSettingsKey;
          setOutputs([]);
          setRuntimeError(undefined);
          void runtime
            .start(files, folders, stableRuntimeHandlerRef.current, settings, {
              forceStart: runKey > 0,
            })
            .then(() => {
              const latest = latestProjectRef.current;
              void runtime.sync(latest.files, latest.folders);
            });
          return;
        }
        if (runtimeSettingsKey !== lastRuntimeSettingsKeyRef.current) {
          lastRuntimeSettingsKeyRef.current = runtimeSettingsKey;
          setOutputs([]);
          setRuntimeError(undefined);
          void runtime.restart(files, folders, stableRuntimeHandlerRef.current, settings);
          return;
        }
        if (runKey !== lastRunKeyRef.current) {
          lastRunKeyRef.current = runKey;
          setOutputs([]);
          setRuntimeError(undefined);
          void runtime.restart(files, folders, stableRuntimeHandlerRef.current, settings, {
            forceStart: true,
          });
          return;
        }
        void runtime.sync(files, folders).then(({ packageChanged }) => {
          if (!packageChanged || cancelled) return;
          setOutputs([]);
          setRuntimeError(undefined);
          void runtime.restart(
            latestProjectRef.current.files,
            latestProjectRef.current.folders,
            stableRuntimeHandlerRef.current,
            settings,
          );
        });
      }, 250);
    };
    void setupRuntime();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [
    file,
    files,
    folders,
    runKey,
    settings.autoInstall,
    settings.autoStartPreview,
    settings.packageManager,
  ]);
  const runState =
    runtimeError || runtimeState === "error"
      ? "error"
      : runtimeState === "installing"
        ? "installing"
        : runtimeState === "starting"
          ? "starting"
          : runtimeState === "paused"
            ? "paused"
            : "idle";
  const headerLabel = previewUrl ?? t(`preview.${runState === "idle" ? "ready" : runState}`);
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
      className="glass-panel flex h-full min-h-0 flex-col overflow-hidden bg-iris-preview px-[6px] text-iris-ink"
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
            className="box-border grid h-4 w-4 place-items-center rounded-[4px] border border-transparent bg-transparent p-0 text-iris-muted transition-colors duration-150 hover:text-iris-strong focus-visible:text-iris-strong active:scale-[0.97]"
            type="button"
            onClick={() => {
              setPreviewLoaded(false);
              setPreviewLoadKey((value) => value + 1);
              setRunKey((value) => value + 1);
            }}
            aria-label={t("preview.run")}
            title={t("preview.run")}
            style={{
              backgroundColor: "transparent",
              boxSizing: "border-box",
              height: "16px",
              padding: 0,
              width: "16px",
            }}
            whileTap={{ scale: 0.92 }}
          >
            <ReloadIcon width="11" height="11" />
          </motion.button>
        </IconButton>
      </header>
      <div className="relative min-h-[220px] flex-1 p-0 max-[760px]:min-h-0">
        <iframe
          key={previewLoadKey}
          ref={iframeRef}
          title={`Preview of ${file.path}`}
          src={previewUrl}
          srcDoc={previewUrl ? undefined : fallbackDocument}
          sandbox="allow-scripts allow-same-origin"
          className="block h-full min-h-[260px] w-full border-0 bg-white shadow-none"
          onLoad={() => window.setTimeout(() => setPreviewLoaded(true), 900)}
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
      </div>
      <PreviewConsole
        outputs={outputs}
        onClear={() => setOutputs([])}
        getPreviewHeight={() => sectionRef.current?.getBoundingClientRect().height ?? 288}
      />
    </motion.section>
  );
}
