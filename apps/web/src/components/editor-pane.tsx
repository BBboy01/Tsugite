import { useEffect, useRef } from "react";
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
import { Cross2Icon } from "@radix-ui/react-icons";
import type { LoroDoc } from "loro-crdt";

import type { PresenceMember, ProjectFile, ProjectSettings } from "@iris/shared";

import { getEditorTabLabels } from "../lib/editor-tabs";
import { useEditorUndoManager } from "../lib/editor-undo";
import { FileTypeIcon } from "../lib/file-icon";
import { deferredLoroUndoKeymap, groupedLoroUndo } from "../lib/loro-undo-keymap";
import { getFileCollaboratorCount } from "../lib/presence";
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
    return transaction.docChanged || transaction.selection
      ? buildRelativeLineNumberMarkers(transaction.state)
      : markers;
  },
  provide: (field) => lineNumberMarkers.from(field),
});

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

type EditorPaneProps = {
  doc: LoroDoc;
  file: ProjectFile;
  tabs: ProjectFile[];
  settings: ProjectSettings;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onCursorChange: (cursor: { anchor: number; head: number }) => void;
  onLocalInteraction: () => void;
  followedSelection: { anchor: number; head: number } | null;
  remoteMembers: readonly PresenceMember[];
  currentUserId: string;
};

export function EditorPane({
  doc,
  file,
  tabs,
  settings,
  onSelectTab,
  onCloseTab,
  onCursorChange,
  onLocalInteraction,
  followedSelection,
  remoteMembers,
  currentUserId,
}: EditorPaneProps) {
  const { t } = useTranslation();
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const relativeLineNumbersCompartmentRef = useRef<Compartment | null>(null);
  const relativeLineNumbersRef = useRef(settings.relativeLineNumbers);
  const remoteMembersRef = useRef(remoteMembers);
  const cursorChangeRef = useRef(onCursorChange);
  const localInteractionRef = useRef(onLocalInteraction);
  const followedSelectionRef = useRef(followedSelection);
  const undoManager = useEditorUndoManager(doc, file.id);
  const tabLabels = getEditorTabLabels(tabs.map((tab) => tab.path));
  cursorChangeRef.current = onCursorChange;
  localInteractionRef.current = onLocalInteraction;
  followedSelectionRef.current = followedSelection;
  relativeLineNumbersRef.current = settings.relativeLineNumbers;
  remoteMembersRef.current = remoteMembers;

  useEffect(() => {
    if (!hostRef.current) return;

    let disposed = false;
    let view: EditorView | undefined;
    let relativeLineNumbersCompartment: Compartment | undefined;
    const setupEditor = async () => {
      const source = file.text.toString();
      const language = getEditorLanguage(file.path, file.language);
      const typeScriptEnabled = supportsTypeScriptServices(language);
      const typeScriptServices = typeScriptEnabled
        ? await Promise.all([
            import("@valtown/codemirror-ts"),
            import("../lib/typescript-environment"),
            import("../lib/typescript-hover"),
          ])
        : undefined;
      const environment = typeScriptServices
        ? typeScriptServices[1].createEditorTypeScriptEnvironment(file.path, source)
        : undefined;
      if (disposed || !hostRef.current) return;

      relativeLineNumbersCompartment = new Compartment();
      relativeLineNumbersCompartmentRef.current = relativeLineNumbersCompartment;
      view = new EditorView({
        state: EditorState.create({
          doc: source,
          extensions: [
            basicSetup,
            relativeLineNumbersCompartment.of(
              relativeLineNumbersRef.current ? relativeLineNumberMarkers : [],
            ),
            getEditorLanguageSupport(language),
            ...(settings.wordWrap ? [EditorView.lineWrapping] : []),
            ...(environment && typeScriptServices
              ? [
                  typeScriptServices[0].tsFacet.of({ env: environment, path: file.path }),
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
              if (hasUserEvent || update.focusChanged) localInteractionRef.current();
              const selection = update.state.selection.main;
              cursorChangeRef.current({
                anchor: selection.anchor,
                head: selection.head,
              });
            }),
            editorTheme(settings),
          ],
        }),
        parent: hostRef.current,
      });
      viewRef.current = view;
      updateRemotePresence(
        view,
        getRemoteSelections(
          remoteMembersRef.current,
          currentUserId,
          file.path,
          view.state.doc.length,
        ),
      );
      const selection = followedSelectionRef.current;
      if (selection) {
        const anchor = Math.max(0, Math.min(selection.anchor, view.state.doc.length));
        const head = Math.max(0, Math.min(selection.head, view.state.doc.length));
        view.dispatch({ selection: { anchor, head }, scrollIntoView: true });
      }
    };

    void setupEditor();

    return () => {
      disposed = true;
      view?.destroy();
      if (viewRef.current === view) viewRef.current = null;
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
    undoManager,
  ]);

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
    const anchor = Math.max(0, Math.min(followedSelection.anchor, view.state.doc.length));
    const head = Math.max(0, Math.min(followedSelection.head, view.state.doc.length));
    const currentSelection = view.state.selection.main;
    if (currentSelection.anchor === anchor && currentSelection.head === head) return;
    view.dispatch({ selection: { anchor, head }, scrollIntoView: true });
  }, [file.path, followedSelection]);

  return (
    <section
      className="flex min-w-0 min-h-0 flex-1 flex-col bg-[var(--editor-surface)]"
      aria-label={t("files.editing", { path: file.path })}
    >
      <div className="editor-toolbar glass-toolbar flex h-12 min-w-0 flex-none items-center px-4 max-[760px]:h-11 max-[760px]:px-3">
        <div
          className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label={t("editor.openFiles")}
        >
          <div className="flex min-w-max items-center gap-1">
            {tabs.map((tab, index) => {
              const active = tab.path === file.path;
              const collaboratorCount = getFileCollaboratorCount(
                remoteMembers,
                currentUserId,
                tab.path,
              );
              return (
                <div
                  className={`group flex h-[30px] shrink-0 items-center rounded-lg font-iris-mono text-[10px] leading-none transition-[background-color] duration-150 ease-out ${
                    active
                      ? "bg-[color-mix(in_srgb,var(--accent)_18%,var(--editor-surface))] text-iris-ink shadow-[0_1px_2px_rgba(75,67,45,0.06)]"
                      : "text-iris-muted hover:bg-[color-mix(in_srgb,var(--accent)_14%,var(--editor-surface))] hover:text-iris-ink"
                  }`}
                  key={tab.id}
                >
                  <button
                    className="flex h-full min-w-0 max-w-[min(32vw,220px)] items-center gap-2 overflow-hidden rounded-l-lg border-0 bg-transparent px-2.5 text-left text-inherit transition-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[color-mix(in_srgb,var(--accent)_48%,transparent)] max-[760px]:max-w-[180px] max-[760px]:px-2"
                    type="button"
                    role="tab"
                    aria-selected={active}
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
                      {tabLabels[index]}
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
                    className="mr-1 grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md border-0 bg-transparent text-iris-muted opacity-0 transition-none group-hover:opacity-100 focus-visible:opacity-100 hover:text-iris-strong focus-visible:text-iris-strong focus-visible:outline-2 focus-visible:outline-[color-mix(in_srgb,var(--accent)_36%,transparent)]"
                    type="button"
                    aria-label={t("editor.closeFile", { path: tab.path })}
                    title={t("editor.closeFile", { path: tab.path })}
                    onClick={() => onCloseTab(tab.path)}
                  >
                    <Cross2Icon width="13" height="13" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 [&_.cm-editor]:h-full" ref={hostRef} />
    </section>
  );
}

function editorTheme(settings: ProjectSettings) {
  return EditorView.theme({
    "&": {
      height: "100%",
      color: "var(--ink)",
      backgroundColor: "var(--editor-surface)",
      fontFamily: `'${settings.fontFamily}', 'IBM Plex Mono', ui-monospace, monospace`,
      fontSize: `${settings.fontSize}px`,
    },
    "&.cm-focused": {
      outline: "none",
    },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: "inherit",
      lineHeight: "1.75",
      padding: "0 0 32px",
    },
    ".cm-panel.cm-search": {
      backgroundColor: "var(--editor-surface)",
      color: "var(--ink)",
      fontFamily: "var(--mono-font)",
      fontSize: "11px",
    },
    ".cm-panel.cm-search .cm-textfield": {
      backgroundColor: "color-mix(in srgb, var(--glass-popover) 72%, var(--editor-surface))",
      border: "1px solid var(--divider)",
      borderRadius: "6px",
      color: "var(--ink)",
      outline: "none",
      padding: "3px 6px",
    },
    ".cm-panel.cm-search .cm-textfield:focus": {
      borderColor: "var(--accent)",
      boxShadow: "0 0 0 2px color-mix(in srgb, var(--accent) 16%, transparent)",
    },
    ".cm-panel.cm-search .cm-textfield::placeholder": {
      color: "var(--muted)",
      opacity: "1",
    },
    ".cm-panel.cm-search .cm-button": {
      backgroundColor: "transparent",
      border: "1px solid transparent",
      borderRadius: "5px",
      color: "var(--accent-deep)",
      fontFamily: "var(--mono-font)",
      padding: "3px 6px",
    },
    ".cm-panel.cm-search .cm-button:hover": {
      backgroundColor: "color-mix(in srgb, var(--accent) 12%, transparent)",
      color: "var(--ink-strong)",
    },
    ".cm-panel.cm-search label": {
      alignItems: "center",
      color: "var(--muted)",
      display: "inline-flex",
      gap: "4px",
      lineHeight: "1.2",
      margin: "0 0.6em 0.2em 0",
      verticalAlign: "middle",
    },
    ".cm-panel.cm-search input[type=checkbox]": {
      accentColor: "var(--accent)",
      flex: "none",
      margin: "0",
    },
    ".cm-panel.cm-search [name=close]": {
      backgroundColor: "transparent",
      border: "none",
      color: "var(--muted)",
      fontSize: "16px",
      lineHeight: "1",
    },
    ".cm-panel.cm-search [name=close]:hover": {
      color: "var(--ink-strong)",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeft: "2px solid var(--accent)",
      marginLeft: "-1px",
    },
    ".cm-content": {
      caretColor: "var(--accent)",
      padding: "0 28px 0 0",
    },
    ".cm-content span": {
      color: "inherit",
    },
    ".cm-gutters": {
      border: "none",
      backgroundColor: "var(--editor-surface)",
      color: "var(--muted)",
      minWidth: "56px",
      padding: "0 12px 0 0",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: "var(--accent)",
    },
    ".cm-activeLine": {
      backgroundColor: "color-mix(in srgb, var(--accent) 8%, transparent)",
    },
    ".cm-selectionBackground, ::selection": {
      backgroundColor: "color-mix(in srgb, var(--accent) 22%, transparent)",
    },
    ".cm-remote-selection": {
      backgroundColor: "color-mix(in srgb, var(--remote-color) 24%, transparent)",
    },
    ".cm-remote-cursor": {
      position: "relative",
      display: "inline-block",
      width: "0",
      height: "1.75em",
      verticalAlign: "text-bottom",
      borderLeft: "2px solid var(--remote-color)",
      pointerEvents: "none",
      zIndex: "3",
    },
    ".cm-remote-cursor-label": {
      position: "absolute",
      left: "-1px",
      bottom: "calc(100% - 2px)",
      zIndex: "4",
      display: "block",
      maxWidth: "160px",
      overflow: "hidden",
      padding: "3px 5px",
      borderRadius: "4px",
      color: "var(--editor-surface)",
      backgroundColor: "var(--remote-color)",
      fontFamily: "var(--mono-font)",
      fontSize: "9px",
      lineHeight: "1",
      whiteSpace: "nowrap",
      textOverflow: "ellipsis",
      transform: "translateY(-2px)",
    },
    ".cm-content .cm-remote-cursor-label": {
      color: "var(--editor-surface)",
    },
  });
}
