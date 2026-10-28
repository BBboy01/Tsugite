import { Reorder } from "motion/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { WorkspaceTheme } from "@iris/shared";
import type { buildEditorTabViewModels } from "../lib/editor-tab-model";
import type { EditorTabCloseMode } from "../lib/editor-tabs";
import { EditorTabs } from "./editor-tabs";
import { EditorFileTab } from "./editor-file-tab";

export type EditorFileTabsProps = {
  tabViewModels: ReturnType<typeof buildEditorTabViewModels>;
  theme: WorkspaceTheme;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onCloseTabs: (path: string, mode: EditorTabCloseMode) => void;
  onReorderTabs: (paths: string[]) => void;
};

export function EditorFileTabs({
  tabViewModels,
  theme,
  onSelectTab,
  onCloseTab,
  onCloseTabs,
  onReorderTabs,
}: EditorFileTabsProps) {
  const { t } = useTranslation();
  const activePath = tabViewModels.find((tab) => tab.active)?.file.path;
  const [focusedPath, setFocusedPath] = useState<string>();
  const [copyError, setCopyError] = useState(false);
  const paths = tabViewModels.map((tab) => tab.file.path);
  const tabStopPath = paths.includes(focusedPath ?? "") ? focusedPath : activePath;
  const copyPath = async (path: string) => {
    setCopyError(false);
    try {
      await navigator.clipboard.writeText(path);
    } catch {
      setCopyError(true);
    }
  };

  return (
    <div>
      <EditorTabs label={t("editor.openFiles")} activeValue={activePath}>
        <Reorder.Group
          as="div"
          axis="x"
          values={paths}
          onReorder={onReorderTabs}
          className="flex min-w-max items-center gap-1"
        >
          {tabViewModels.map((tab, index) => (
            <EditorFileTab
              key={tab.file.id}
              tab={tab}
              theme={theme}
              tabStop={tab.file.path === tabStopPath}
              canCloseOthers={paths.length > 1}
              canCloseRight={index < paths.length - 1}
              onFocus={() => setFocusedPath(tab.file.path)}
              onBlur={(event) => {
                if (!event.currentTarget.closest('[role="tablist"]')?.contains(event.relatedTarget))
                  setFocusedPath(undefined);
              }}
              onSelect={() => onSelectTab(tab.file.path)}
              onClose={() => onCloseTab(tab.file.path)}
              onCloseTabs={(mode) => onCloseTabs(tab.file.path, mode)}
              onCopyPath={() => void copyPath(tab.file.path)}
              onMove={(direction) => {
                const nextIndex = index + direction;
                if (nextIndex < 0 || nextIndex >= paths.length) return;
                const next = [...paths];
                [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
                onReorderTabs(next);
              }}
            />
          ))}
        </Reorder.Group>
      </EditorTabs>
      {copyError && (
        <p
          role="alert"
          className="m-0 flex items-center justify-between gap-2 border-t border-iris-divider px-3 py-1 font-iris-mono text-xs text-iris-ink"
        >
          {t("editor.tabs.copyFailed")}
          <button type="button" onClick={() => setCopyError(false)}>
            {t("editor.context.dismiss")}
          </button>
        </p>
      )}
    </div>
  );
}
