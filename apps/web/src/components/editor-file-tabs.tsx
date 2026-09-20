import { X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { buildEditorTabViewModels } from "../lib/editor-tab-model";
import { FileTypeIcon } from "../lib/file-icon";
import { EditorTabs } from "./editor-tabs";

export function EditorFileTabs({
  tabViewModels,
  onSelectTab,
  onCloseTab,
}: {
  tabViewModels: ReturnType<typeof buildEditorTabViewModels>;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
}) {
  const { t } = useTranslation();
  const activePath = tabViewModels.find((tab) => tab.active)?.file.path;
  const [focusedPath, setFocusedPath] = useState<string>();
  const tabStopPath = tabViewModels.some((tab) => tab.file.path === focusedPath)
    ? focusedPath
    : activePath;
  return (
    <EditorTabs label={t("editor.openFiles")} activeValue={activePath}>
      {tabViewModels.map(({ file: tab, label, active, collaboratorCount }) => {
        return (
          <div
            className={`group flex h-[30px] shrink-0 items-center rounded-lg font-iris-mono text-[10px] leading-none transition-[background-color] duration-150 ease-out ${
              active
                ? "bg-[color-mix(in_srgb,var(--accent)_18%,var(--editor-surface))] text-iris-ink shadow-[0_1px_2px_rgba(75,67,45,0.06)]"
                : "text-[color-mix(in_srgb,var(--muted)_45%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_14%,var(--editor-surface))] hover:text-iris-ink"
            }`}
            key={tab.id}
          >
            <button
              className="flex h-full min-w-0 max-w-[min(32vw,220px)] items-center gap-2 overflow-hidden rounded-l-lg border-0 bg-transparent px-2.5 text-left text-inherit transition-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[color-mix(in_srgb,var(--accent)_48%,transparent)] max-[760px]:max-w-[180px] max-[760px]:px-2"
              type="button"
              role="tab"
              aria-selected={active}
              tabIndex={tab.path === tabStopPath ? 0 : -1}
              onFocus={() => setFocusedPath(tab.path)}
              onBlur={(event) => {
                if (
                  !event.currentTarget.closest('[role="tablist"]')?.contains(event.relatedTarget)
                ) {
                  setFocusedPath(undefined);
                }
              }}
              aria-label={
                collaboratorCount > 0
                  ? `${tab.path}, ${t("editor.collaboratorsInFile", { count: collaboratorCount })}`
                  : tab.path
              }
              title={tab.path}
              onClick={() => onSelectTab(tab.path)}
            >
              <FileTypeIcon
                path={tab.path}
                className="shrink-0 text-[var(--accent)]"
                width="12"
                height="12"
              />
              <span className={`truncate ${active ? "text-[var(--accent-deep)]" : ""}`}>
                {label}
              </span>
              {collaboratorCount > 0 && (
                <span
                  className="grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] px-1 font-iris-mono text-[9px] leading-none text-[var(--accent-deep)]"
                  data-collaborator-badge={tab.path}
                  title={t("editor.collaboratorsInFile", { count: collaboratorCount })}
                  aria-hidden="true"
                >
                  +{collaboratorCount}
                </span>
              )}
            </button>
            <button
              className="mr-1 grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md border-0 bg-transparent text-[color-mix(in_srgb,var(--muted)_45%,transparent)] opacity-0 transition-none group-hover:opacity-100 focus-visible:opacity-100 hover:text-iris-strong focus-visible:text-iris-strong focus-visible:outline-2 focus-visible:outline-[color-mix(in_srgb,var(--accent)_36%,transparent)]"
              type="button"
              aria-label={t("editor.closeFile", { path: tab.path })}
              title={t("editor.closeFile", { path: tab.path })}
              onClick={() => onCloseTab(tab.path)}
            >
              <X width="13" height="13" />
            </button>
          </div>
        );
      })}
    </EditorTabs>
  );
}
