import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { basicSetup } from "codemirror";
import {
  Compartment,
  EditorState,
  RangeSet,
  RangeSetBuilder,
  StateField,
  Transaction,
} from "@codemirror/state";
import { EditorView, GutterMarker, lineNumberMarkers } from "@codemirror/view";
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
import { shikiHighlight } from "../lib/shiki-highlighting";
import {
  getRemoteSelections,
  remotePresenceExtension,
  updateRemotePresence,
} from "../lib/remote-presence";
import { getShikiTheme } from "../lib/workspace-theme";
import { clampEditorSelection, type EditorSelection } from "../lib/editor-selection";
import type { EditorPaneProps } from "./editor-pane.types";
import { EditorFileTabs } from "./editor-file-tabs";
import { EditorFollowingOutline } from "./editor-following-outline";
import { EditorContextMenu } from "./editor-context-menu";
import { editorTheme } from "../lib/editor-theme";
import type { EditorLocation } from "../lib/editor-navigation";
import { attachVimCursorStyle, attachVimStatus } from "../lib/vim-status";
import { attachVimClipboard } from "../lib/vim-clipboard";
import { useSystemClipboard } from "../lib/use-system-clipboard";

class RelativeLineNumberMarker extends GutterMarker {
  constructor(private readonly number: string) {
    super();
  }

  eq(other: GutterMarker): boolean {
    return other instanceof RelativeLineNumberMarker && other.number === this.number;
  }

  toDOM(): Text {
    return document.createTextNode(this.number);
  }
}

const relativeLineNumberMarkers = StateField.define<RangeSet<GutterMarker>>({
  create: buildRelativeLineNumberMarkers,
  update(markers, transaction) {
    if (transaction.docChanged) return buildRelativeLineNumberMarkers(transaction.state);
    if (!transaction.selection) return markers;
    const previousLine = transaction.startState.doc.lineAt(
      transaction.startState.selection.main.head,
    ).number;
    const nextLine = transaction.state.doc.lineAt(transaction.state.selection.main.head).number;
    return previousLine === nextLine ? markers : buildRelativeLineNumberMarkers(transaction.state);
  },
  provide: (field) => lineNumberMarkers.from(field),
});

type SavedEditorSelection = EditorSelection & { fileId: string };

function buildRelativeLineNumberMarkers(state: EditorState): RangeSet<GutterMarker> {
  const currentLine = state.doc.lineAt(state.selection.main.head).number;
  const markers = new RangeSetBuilder<GutterMarker>();

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    const displayNumber =
      lineNumber === currentLine ? lineNumber : Math.abs(lineNumber - currentLine);
    markers.add(line.from, line.from, new RelativeLineNumberMarker(String(displayNumber)));
  }

  return markers.finish();
}

export function EditorPane({
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
}: EditorPaneProps) {
  const { t } = useTranslation();
  const [systemClipboard] = useSystemClipboard();
  const systemClipboardRef = useRef(systemClipboard);
  systemClipboardRef.current = systemClipboard;
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const relativeLineNumbersCompartmentRef = useRef<Compartment | null>(null);
  const relativeLineNumbersRef = useRef(settings.relativeLineNumbers);
  const remoteMembersRef = useRef(remoteMembers);
  const cursorChangeRef = useRef(onCursorChange);
  const localInteractionRef = useRef(onLocalInteraction);
  const followedSelectionRef = useRef(followedSelection);
  const isFollowingRef = useRef(isFollowing);
  const savedSelectionRef = useRef<SavedEditorSelection | null>(null);
  const undoManager = useEditorUndoManager(doc, file.id);
  const [vimStatus, setVimStatus] = useState("NORMAL");
  const pendingLocationRef = useRef<EditorLocation | null>(null);
  const typeScriptEnvironmentRef = useRef<VirtualTypeScriptEnvironment | null>(null);
  const projectFilesRef = useRef(files);
  const tabViewModels = useMemo(
    () => buildEditorTabViewModels(tabs, file.path, remoteMembers, currentUserId),
    [tabs, file.path, remoteMembers, currentUserId],
  );
  cursorChangeRef.current = onCursorChange;
  localInteractionRef.current = onLocalInteraction;
  followedSelectionRef.current = followedSelection;
  isFollowingRef.current = isFollowing;
  relativeLineNumbersRef.current = settings.relativeLineNumbers;
  remoteMembersRef.current = remoteMembers;
  projectFilesRef.current = files;

  useEffect(() => {
    if (!hostRef.current) return;

    let disposed = false;
    let environment: VirtualTypeScriptEnvironment | undefined;
    let view: EditorView | undefined;
    let relativeLineNumbersCompartment: Compartment | undefined;
    let detachVimStatus: () => void = () => undefined;
    let detachVimCursorStyle: () => void = () => undefined;
    let detachVimClipboard: () => void = () => undefined;
    const setupEditor = async () => {
      const language = getEditorLanguage(file.path, file.language);
      const typeScriptEnabled = supportsTypeScriptServices(language);
      const typeScriptServices = typeScriptEnabled
        ? await Promise.all([
            import("@valtown/codemirror-ts"),
            import("../lib/typescript-environment"),
            import("../lib/typescript-hover"),
          ])
        : undefined;
      if (disposed || !hostRef.current) return;
      const source = file.text.toString();
      environment = typeScriptServices
        ? typeScriptServices[1].createEditorTypeScriptEnvironment(
            file.path,
            source,
            projectFilesRef.current.map((projectFile) => ({
              path: projectFile.path,
              text: projectFile.text.toString(),
            })),
          )
        : undefined;
      if (disposed || !hostRef.current) return;
      typeScriptEnvironmentRef.current = environment ?? null;

      relativeLineNumbersCompartment = new Compartment();
      relativeLineNumbersCompartmentRef.current = relativeLineNumbersCompartment;
      view = new EditorView({
        state: EditorState.create({
          doc: source,
          extensions: [
            ...(vimMode ? [vim()] : []),
            basicSetup,
            relativeLineNumbersCompartment.of(
              relativeLineNumbersRef.current ? relativeLineNumberMarkers : [],
            ),
            getEditorLanguageSupport(language),
            ...(settings.wordWrap ? [EditorView.lineWrapping] : []),
            ...(environment && typeScriptServices
              ? [
                  typeScriptServices[0].tsFacet.of({ env: environment, path: `/${file.path}` }),
                  typeScriptServices[0].tsSync(),
                  typeScriptServices[0].tsHover({
                    renderTooltip: typeScriptServices[2].renderTypeScriptHover,
                  }),
                ]
              : []),
            shikiHighlight(language, getShikiTheme(settings.theme)),
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
            editorTheme(settings),
          ],
        }),
        parent: hostRef.current,
      });
      viewRef.current = view;
      const editorView = view;
      editorView.dom.dataset.normalCursorStyle = settings.normalCursorStyle;
      detachVimCursorStyle = vimMode
        ? attachVimCursorStyle(editorView, settings.normalCursorStyle)
        : () => undefined;
      detachVimClipboard = vimMode
        ? attachVimClipboard(editorView, systemClipboardRef.current)
        : () => undefined;
      onEditorFocusReady?.(() => editorView.focus());
      if (vimMode) {
        detachVimStatus = attachVimStatus(editorView, setVimStatus);
      }
      updateRemotePresence(
        view,
        getRemoteSelections(
          remoteMembersRef.current,
          currentUserId,
          file.path,
          view.state.doc.length,
        ),
      );
      const pending = pendingLocationRef.current;
      if (pending?.path === file.path) {
        pendingLocationRef.current = null;
        if (pending.source === view.state.doc.toString()) {
          view.focus();
          view.dispatch({
            selection: { anchor: pending.from, head: pending.to },
            scrollIntoView: true,
            userEvent: "select",
          });
          return;
        }
      }
      const savedSelection = savedSelectionRef.current;
      const selection =
        followedSelectionRef.current ??
        (savedSelection?.fileId === file.id ? savedSelection : undefined);
      if (selection) {
        const { anchor, head } = clampEditorSelection(selection, view.state.doc.length);
        view.dispatch({ selection: { anchor, head }, scrollIntoView: true });
      }
    };

    void setupEditor();

    return () => {
      disposed = true;
      onEditorFocusReady?.(undefined);
      detachVimStatus();
      detachVimCursorStyle();
      detachVimClipboard();
      if (view) {
        savedSelectionRef.current = {
          fileId: file.id,
          anchor: view.state.selection.main.anchor,
          head: view.state.selection.main.head,
        };
      }
      view?.dom.removeAttribute("data-normal-cursor-style");
      view?.destroy();
      if (viewRef.current === view) viewRef.current = null;
      typeScriptEnvironmentRef.current = null;
      environment?.languageService.dispose();
      if (relativeLineNumbersCompartmentRef.current === relativeLineNumbersCompartment) {
        relativeLineNumbersCompartmentRef.current = null;
      }
    };
  }, [
    doc,
    file.id,
    file.path,
    file.language,
    settings.fontFamily,
    settings.fontSize,
    settings.theme,
    settings.wordWrap,
    settings.normalCursorStyle,
    systemClipboard,
    vimMode,
    undoManager,
  ]);

  const navigateToLocation = (location: EditorLocation) => {
    localInteractionRef.current();
    if (location.path === file.path && viewRef.current) {
      const view = viewRef.current;
      view.focus();
      view.dispatch({
        selection: { anchor: location.from, head: location.to },
        scrollIntoView: true,
        userEvent: "select",
      });
    } else {
      pendingLocationRef.current = location;
      onSelectTab(location.path);
    }
  };

  useEffect(() => {
    const view = viewRef.current;
    const compartment = relativeLineNumbersCompartmentRef.current;
    if (!view || !compartment) return;

    view.dispatch({
      effects: compartment.reconfigure(
        settings.relativeLineNumbers ? relativeLineNumberMarkers : [],
      ),
    });
  }, [settings.relativeLineNumbers]);

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
        environmentRef={typeScriptEnvironmentRef}
        path={file.path}
        files={files}
        theme={settings.theme}
        undoManager={undoManager}
        onLocalInteraction={onLocalInteraction}
        onNavigate={navigateToLocation}
      >
        <div className="h-full min-h-0 [&_.cm-editor]:h-full" ref={hostRef} />
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
}
