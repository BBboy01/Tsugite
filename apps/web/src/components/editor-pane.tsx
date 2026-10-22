import { memo, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { EditorState, Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { LoroExtensions } from "loro-codemirror";
import { vim } from "@replit/codemirror-vim";
import type { EditorIntelligence } from "../lib/editor-intelligence";

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
import { EditorStatusBar } from "./editor-status-bar";
import { editorStatus, editorStatusAt } from "../lib/editor-status";
import { attachVimStatusDetails, type VimStatusDetails } from "../lib/vim-status";

type SavedEditorSelection = EditorSelection & { fileId: string };

export const EditorPane = memo(function EditorPane({
  doc,
  intelligence,
  declarations,
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
  const serviceStatus = useSyncExternalStore(
    declarations.subscribeServiceStatus,
    declarations.getServiceStatus,
    declarations.getServiceStatus,
  );
  const declarationStatus = useSyncExternalStore(
    declarations.subscribeDeclarations,
    declarations.getDeclarationsStatus,
    declarations.getDeclarationsStatus,
  );
  const [systemClipboard] = useSystemClipboard();
  const systemClipboardRef = useRef(systemClipboard);
  systemClipboardRef.current = systemClipboard;
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const visualConfigurationRef = useRef<EditorVisualConfiguration | null>(null);
  const vimBindingsRef = useRef<EditorVimBindings | null>(null);
  const vimStatusDetailsRef = useRef<VimStatusDetails | null>(null);
  const settingsRef = useRef(settings);
  const remoteMembersRef = useRef(remoteMembers);
  const cursorChangeRef = useRef(onCursorChange);
  const localInteractionRef = useRef(onLocalInteraction);
  const followedSelectionRef = useRef(followedSelection);
  const isFollowingRef = useRef(isFollowing);
  const savedSelectionRef = useRef<SavedEditorSelection | null>(null);
  const undoManager = useEditorUndoManager(doc, file.id);
  const [vimStatus, setVimStatus] = useState("NORMAL");
  const [statusDetails, setStatusDetails] = useState(() => editorStatus(file.path, 1, 1, 1));
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
    intelligence: EditorIntelligence;
  } | null>(null);
  const typeScriptReady =
    declarationStatus.status === "ready" &&
    serviceStatus.state === "ready" &&
    typeScriptEnvironment?.fileId === file.id &&
    typeScriptEnvironment.path === file.path;
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
          ...(vimMode ? [vim({ status: true })] : []),
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
            if (update.selectionSet || update.docChanged) {
              setStatusDetails(editorStatusAt(update.view, file.path));
              vimStatusDetailsRef.current?.refresh();
            }
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
    const vimStatusDetails = vimMode ? attachVimStatusDetails(view, file.path) : null;
    vimStatusDetailsRef.current = vimStatusDetails;
    setStatusDetails(editorStatusAt(view, file.path));
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
          intelligence,
          () => settingsRef.current.theme,
          (readyIntelligence) =>
            setTypeScriptEnvironment({
              fileId: file.id,
              path: file.path,
              intelligence: readyIntelligence,
            }),
        )
      : undefined;

    return () => {
      onEditorFocusReady?.(undefined);
      vimBindings.destroy();
      vimStatusDetails?.destroy();
      if (vimStatusDetailsRef.current === vimStatusDetails) vimStatusDetailsRef.current = null;
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
  }, [doc, file.id, file.path, file.language, vimMode, undoManager, intelligence]);

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
      data-vim-mode={vimMode ? vimStatus.toLowerCase() : undefined}
    >
      <EditorFileTabs
        tabViewModels={tabViewModels}
        onSelectTab={onSelectTab}
        onCloseTab={onCloseTab}
      />
      <EditorContextMenu
        languageAvailable={serviceStatus.state === "ready"}
        key={file.id + file.path}
        viewRef={viewRef}
        intelligence={
          typeScriptEnvironment?.fileId === file.id && typeScriptEnvironment.path === file.path
            ? typeScriptEnvironment.intelligence
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
          className="flex min-h-0 min-w-0 flex-1 [&_.cm-editor]:h-full"
          ref={hostRef}
          data-editor-content-ready={highlightedFile === currentFileKey}
          data-typescript-ready={typeScriptReady ? "true" : undefined}
          data-typescript-service-state={serviceStatus.state}
          data-typescript-declarations-state={declarationStatus.status}
        />
        {!vimMode && <EditorStatusBar status={statusDetails} />}
        {isFollowing && <EditorFollowingOutline />}
      </EditorContextMenu>
    </section>
  );
});
