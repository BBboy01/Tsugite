import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { EditorState, Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { LoroExtensions } from "loro-codemirror";
import { vim } from "@replit/codemirror-vim";
import type { VirtualTypeScriptEnvironment } from "@typescript/vfs";

import { buildEditorTabViewModels } from "../lib/editor-tab-model";
import { useEditorUndoManager } from "../lib/editor-undo";
import { deferredLoroUndoKeymap, groupedLoroUndo } from "../lib/loro-undo-keymap";
import {
  getEditorLanguage,
  getEditorLanguageSupport,
  supportsTypeScriptServices,
} from "../lib/editor-language";
import {
  getRemoteSelections,
  remotePresenceExtension,
  updateRemotePresence,
} from "../lib/remote-presence";
import { clampEditorSelection, type EditorSelection } from "../lib/editor-selection";
import type { EditorPaneProps } from "./editor-pane.types";
import { EditorFileTabs } from "./editor-file-tabs";
import { EditorFollowingOutline } from "./editor-following-outline";
import { EditorContextMenu } from "./editor-context-menu";
import { EditorVisualConfiguration } from "../lib/editor-visual-configuration";
import { useEditorLocation } from "../lib/use-editor-location";
import { EditorVimBindings } from "../lib/editor-vim-bindings";
import { vimSearchExtension } from "../lib/vim-search";
import { useSystemClipboard } from "../lib/use-system-clipboard";
import { editorBasicSetup } from "../lib/editor-basic-setup";
import { attachEditorTypeScriptServices } from "../lib/editor-typescript-services";

type SavedEditorSelection = EditorSelection & { fileId: string };

export const EditorPane = memo(function EditorPane({
  doc,
  file,
  files,
  tabs,
  settings,
  vimMode,
  onSelectTab,
  onCloseTab,
  onCursorChange,
  onLocalInteraction,
  followedSelection,
  isFollowing,
  remoteMembers,
  currentUserId,
  onEditorFocusReady,
  requestedLocation,
  onLocationHandled,
}: EditorPaneProps) {
  const { t } = useTranslation();
  const [systemClipboard] = useSystemClipboard();
  const systemClipboardRef = useRef(systemClipboard);
  systemClipboardRef.current = systemClipboard;
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const visualConfigurationRef = useRef<EditorVisualConfiguration | null>(null);
  const vimBindingsRef = useRef<EditorVimBindings | null>(null);
  const settingsRef = useRef(settings);
  const remoteMembersRef = useRef(remoteMembers);
  const cursorChangeRef = useRef(onCursorChange);
  const localInteractionRef = useRef(onLocalInteraction);
  const followedSelectionRef = useRef(followedSelection);
  const isFollowingRef = useRef(isFollowing);
  const savedSelectionRef = useRef<SavedEditorSelection | null>(null);
  const undoManager = useEditorUndoManager(doc, file.id);
  const [vimStatus, setVimStatus] = useState("NORMAL");
  const [highlightedFile, setHighlightedFile] = useState<string | null>(null);
  const currentFileKey = `${file.id}:${file.path}`;
  const { navigateToLocation, applyPendingLocation } = useEditorLocation({
    path: file.path,
    viewRef,
    requestedLocation,
    onLocationHandled,
    onLocalInteraction,
    onSelectTab,
  });
  const [typeScriptEnvironment, setTypeScriptEnvironment] = useState<{
    fileId: string;
    path: string;
    environment: VirtualTypeScriptEnvironment;
  } | null>(null);
  const projectFilesRef = useRef(files);
  const tabViewModels = useMemo(
    () => buildEditorTabViewModels(tabs, file.path, remoteMembers, currentUserId),
    [tabs, file.path, remoteMembers, currentUserId],
  );
  cursorChangeRef.current = onCursorChange;
  localInteractionRef.current = onLocalInteraction;
  followedSelectionRef.current = followedSelection;
  isFollowingRef.current = isFollowing;
  settingsRef.current = settings;
  remoteMembersRef.current = remoteMembers;
  projectFilesRef.current = files;

  useEffect(() => {
    if (!hostRef.current) return;

    const language = getEditorLanguage(file.path, file.language);
    setTypeScriptEnvironment(null);
    const currentSettings = settingsRef.current;
    const source = file.text.toString();

    const visualConfiguration = new EditorVisualConfiguration(language, currentSettings, () =>
      setHighlightedFile(`${file.id}:${file.path}`),
    );
    visualConfigurationRef.current = visualConfiguration;
    const visualExtensions = visualConfiguration.extensions;
    const view = new EditorView({
      state: EditorState.create({
        doc: source,
        extensions: [
          ...(vimMode ? [vim()] : []),
          ...(vimMode ? [vimSearchExtension] : []),
          visualExtensions.lineNumbers,
          editorBasicSetup(),
          getEditorLanguageSupport(language),
          visualExtensions.wordWrap,
          visualExtensions.highlighting,
          remotePresenceExtension(),
          deferredLoroUndoKeymap(undoManager),
          groupedLoroUndo(undoManager),
          LoroExtensions(doc, undefined, undoManager, () => file.text),
          EditorView.updateListener.of((update) => {
            const hasUserEvent = update.transactions.some((transaction) =>
              Boolean(transaction.annotation(Transaction.userEvent)),
            );
            if ((!hasUserEvent && !update.focusChanged) || !update.view.hasFocus) {
              return;
            }
            if (hasUserEvent) localInteractionRef.current();
            const selection = update.state.selection.main;
            if (hasUserEvent || (update.focusChanged && !isFollowingRef.current)) {
              cursorChangeRef.current({
                anchor: selection.anchor,
                head: selection.head,
              });
            }
          }),
          visualExtensions.theme,
        ],
      }),
      parent: hostRef.current,
    });
    viewRef.current = view;
    const vimBindings = new EditorVimBindings(
      view,
      vimMode,
      currentSettings.normalCursorStyle,
      systemClipboardRef.current,
      setVimStatus,
    );
    vimBindingsRef.current = vimBindings;
    onEditorFocusReady?.(() => view.focus());
    updateRemotePresence(
      view,
      getRemoteSelections(
        remoteMembersRef.current,
        currentUserId,
        file.path,
        view.state.doc.length,
      ),
    );
    if (!applyPendingLocation(view)) {
      const savedSelection = savedSelectionRef.current;
      const selection =
        followedSelectionRef.current ??
        (savedSelection?.fileId === file.id ? savedSelection : undefined);
      if (selection) {
        const { anchor, head } = clampEditorSelection(selection, view.state.doc.length);
        view.dispatch({ selection: { anchor, head }, scrollIntoView: true });
      }
    }

    const detachTypeScript = supportsTypeScriptServices(language)
      ? attachEditorTypeScriptServices(
          view,
          file.path,
          () =>
            projectFilesRef.current.map((projectFile) => ({
              path: projectFile.path,
              text: projectFile.text.toString(),
            })),
          (environment) =>
            setTypeScriptEnvironment({ fileId: file.id, path: file.path, environment }),
        )
      : undefined;

    return () => {
      onEditorFocusReady?.(undefined);
      vimBindings.destroy();
      vimBindingsRef.current = null;
      savedSelectionRef.current = {
        fileId: file.id,
        anchor: view.state.selection.main.anchor,
        head: view.state.selection.main.head,
      };
      view.destroy();
      if (viewRef.current === view) viewRef.current = null;
      detachTypeScript?.();
      visualConfigurationRef.current = null;
    };
  }, [doc, file.id, file.path, file.language, vimMode, undoManager]);

  useEffect(() => {
    vimBindingsRef.current?.update(settings.normalCursorStyle, systemClipboard);
  }, [settings.normalCursorStyle, systemClipboard]);

  useEffect(() => {
    const view = viewRef.current;
    const configuration = visualConfigurationRef.current;
    if (!view || !configuration) return;

    const effects = configuration.reconfigure(settings);
    if (effects.length > 0) view.dispatch({ effects });
  }, [settings]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    updateRemotePresence(
      view,
      getRemoteSelections(remoteMembers, currentUserId, file.path, view.state.doc.length),
    );
  }, [currentUserId, file.path, remoteMembers]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !followedSelection) return;
    const { anchor, head } = clampEditorSelection(followedSelection, view.state.doc.length);
    const currentSelection = view.state.selection.main;
    if (currentSelection.anchor === anchor && currentSelection.head === head) return;
    view.dispatch({ selection: { anchor, head }, scrollIntoView: true });
  }, [file.path, followedSelection]);

  return (
    <section
      className="flex min-w-0 min-h-0 flex-1 flex-col bg-[var(--editor-surface)]"
      aria-label={t("files.editing", { path: file.path })}
    >
      <EditorFileTabs
        tabViewModels={tabViewModels}
        onSelectTab={onSelectTab}
        onCloseTab={onCloseTab}
      />
      <EditorContextMenu
        key={file.id + file.path}
        viewRef={viewRef}
        environment={
          typeScriptEnvironment?.fileId === file.id && typeScriptEnvironment.path === file.path
            ? typeScriptEnvironment.environment
            : null
        }
        path={file.path}
        files={files}
        theme={settings.theme}
        undoManager={undoManager}
        onLocalInteraction={onLocalInteraction}
        onNavigate={navigateToLocation}
      >
        <div
          className="h-full min-h-0 [&_.cm-editor]:h-full"
          ref={hostRef}
          style={{ opacity: highlightedFile === currentFileKey ? 1 : 0 }}
        />
        {isFollowing && <EditorFollowingOutline />}
      </EditorContextMenu>
      {vimMode && (
        <div
          className="flex h-6 flex-none items-center border-t border-iris-divider px-3 font-iris-mono text-[10px] uppercase tracking-[0.08em] text-iris-muted"
          data-vim-mode={vimStatus.toLowerCase()}
        >
          {vimStatus}
        </div>
      )}
    </section>
  );
});
