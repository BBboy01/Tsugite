import * as ContextMenu from "@radix-ui/react-context-menu";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { EditorSelection, type EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { EditorIntelligence } from "../lib/editor-intelligence";
import type { ProjectFile, ProjectSettings } from "@iris/shared";
import type { UndoManager } from "loro-crdt";
import {
  queryEditorLocations,
  matchesIntelligenceSnapshot,
  LatestIntelligenceRequest,
  type EditorLocation,
  type NavigationKind,
} from "../lib/editor-navigation";
import { runClipboardAction } from "../lib/editor-clipboard";
import { EditorContextFeedback, type EditorContextError } from "./editor-context-feedback";
import type { PeekResult } from "./editor-peek";
import { editItems, navigationItems } from "./editor-context-actions";

type Props = {
  children: ReactNode;
  viewRef: RefObject<EditorView | null>;
  intelligence: EditorIntelligence | null;
  files: ProjectFile[];
  path: string;
  theme: ProjectSettings["theme"];
  undoManager: UndoManager;
  onNavigate: (location: EditorLocation) => void;
  onLocalInteraction: () => void;
};

const itemClass =
  "flex cursor-default select-none items-center gap-2 rounded px-2 py-1.5 outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-[var(--selection-surface)]";

export function EditorContextMenu({
  children,
  viewRef,
  intelligence,
  files,
  path,
  theme,
  undoManager,
  onNavigate,
  onLocalInteraction,
}: Props) {
  const { t } = useTranslation();
  const [target, setTarget] = useState<{
    position: number;
    state: EditorState;
    view: EditorView;
  } | null>(null);
  const [peek, setPeek] = useState<PeekResult | null>(null);
  const [error, setError] = useState<EditorContextError | null>(null);
  const beforeRightClick = useRef<EditorSelection | null>(null);
  const keepPeekFocus = useRef(false);
  const mounted = useRef(true);
  const requests = useRef(new LatestIntelligenceRequest());
  const current = useRef({ files, path, intelligence });
  current.current = { files, path, intelligence };
  const surfaceRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requests.current.invalidate();
    };
  }, []);

  const restoreFocus = () => viewRef.current?.focus();
  const closePeek = () => {
    setPeek(null);
    keepPeekFocus.current = false;
    restoreFocus();
  };
  const navigate = (location: EditorLocation) => {
    const foundFile = files.find((file) => file.path === location.path);
    if (foundFile?.text.toString() !== location.source) {
      setPeek(null);
      setError("staleTarget");
      return;
    }
    setPeek(null);
    keepPeekFocus.current = false;
    onNavigate(location);
  };
  const runNavigation = async (kind: NavigationKind, title: string, preview = false) => {
    const view = viewRef.current;
    if (!view || !intelligence || !target) return;
    if (target.view !== view || view.state.doc !== target.state.doc) {
      setError("staleTarget");
      return;
    }
    onLocalInteraction();
    const isCurrent = requests.current.begin();
    const doc = view.state.doc;
    const snapshot = files.map((file) => ({ path: file.path, text: file.text.toString() }));
    const valid = () =>
      mounted.current &&
      isCurrent() &&
      viewRef.current === view &&
      view.state.doc === doc &&
      current.current.path === path &&
      current.current.intelligence === intelligence &&
      matchesIntelligenceSnapshot(
        snapshot,
        current.current.files.map((file) => ({ path: file.path, text: file.text.toString() })),
      );
    try {
      const result = await queryEditorLocations(
        intelligence,
        snapshot,
        path,
        target.position,
        kind,
      );
      if (!valid()) return;
      if (result.status !== "ok" && result.status !== "empty") {
        if (result.status === "error" || result.status === "timeout") setError("queryFailed");
        return;
      }
      const locations = result.status === "ok" ? result.value : [];
      if (!preview && locations.length === 1) navigate(locations[0]);
      else {
        keepPeekFocus.current = true;
        setPeek({ title, locations });
      }
    } catch {
      if (valid()) setError("queryFailed");
    }
  };
  const runEdit = async (action: (typeof editItems)[number]["id"]) => {
    const view = viewRef.current;
    if (!view || !target || target.view !== view) return;
    if (view.state.doc !== target.state.doc) {
      setError("staleTarget");
      return;
    }
    onLocalInteraction();
    restoreFocus();
    try {
      if (action === "undo") undoManager.undo();
      else if (action === "redo") undoManager.redo();
      else if (action === "selectAll")
        view.dispatch({
          selection: EditorSelection.single(0, view.state.doc.length),
          userEvent: "select",
        });
      else
        await runClipboardAction(view, action, () => mounted.current && viewRef.current === view);
    } catch (failure) {
      if (mounted.current)
        setError(
          failure instanceof Error && failure.message === "staleTarget"
            ? "staleTarget"
            : "clipboardFailed",
        );
    }
  };
  const disabled = (id: (typeof editItems)[number]["id"]) => {
    if (!target) return true;
    if (id === "undo") return target.state.readOnly || !undoManager.canUndo();
    if (id === "redo") return target.state.readOnly || !undoManager.canRedo();
    if (id === "copy" || id === "cut")
      return (
        target.state.selection.ranges.every((range) => range.empty) ||
        !navigator.clipboard?.writeText ||
        (id === "cut" && target.state.readOnly)
      );
    if (id === "paste") return target.state.readOnly || !navigator.clipboard?.readText;
    return false;
  };
  return (
    <div ref={surfaceRef} className="flex min-h-0 flex-1 flex-col">
      <ContextMenu.Root
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
      >
        <ContextMenu.Trigger asChild>
          <div
            className="relative min-h-0 flex-1"
            onMouseDownCapture={(event) => {
              if (event.button === 2)
                beforeRightClick.current = viewRef.current?.state.selection ?? null;
            }}
            onContextMenu={(event) => {
              const view = viewRef.current;
              if (!view || !(event.target instanceof Node) || !view.dom.contains(event.target)) {
                event.preventDefault();
                return;
              }
              const position =
                view.posAtCoords({ x: event.clientX, y: event.clientY }) ??
                view.state.selection.main.head;
              const selection = beforeRightClick.current ?? view.state.selection;
              beforeRightClick.current = null;
              onLocalInteraction();
              view.dispatch({
                selection: selection.ranges.some(
                  (range) => position >= range.from && position <= range.to,
                )
                  ? selection
                  : EditorSelection.single(position),
                userEvent: "select.pointer",
              });
              setError(null);
              keepPeekFocus.current = false;
              setTarget({ position, state: view.state, view });
            }}
            onKeyDown={(event) => {
              if (!(event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))) return;
              const view = viewRef.current;
              const coords = view?.coordsAtPos(view.state.selection.main.head);
              if (!view || !coords) return;
              event.preventDefault();
              event.stopPropagation();
              beforeRightClick.current = view.state.selection;
              view.contentDOM.dispatchEvent(
                new MouseEvent("contextmenu", {
                  bubbles: true,
                  clientX: coords.left,
                  clientY: coords.top,
                  button: 2,
                }),
              );
            }}
          >
            {children}
          </div>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content
            className={`theme-${theme} glass-popover z-50 max-h-[var(--radix-context-menu-content-available-height)] overflow-auto rounded-lg border border-iris-divider bg-iris-preview p-1 font-iris-mono text-[11px] text-iris-ink shadow-lg`}
            style={{
              width: "min(210px, var(--radix-popper-available-width))",
              minWidth: 0,
              maxWidth: "var(--radix-popper-available-width)",
            }}
            collisionPadding={8}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (keepPeekFocus.current)
                surfaceRef.current?.querySelector<HTMLElement>("[data-editor-peek]")?.focus();
              else restoreFocus();
            }}
          >
            {navigationItems.map(({ id, kind, icon: Icon, ...options }) => (
              <ContextMenu.Item
                key={id}
                className={itemClass}
                disabled={!intelligence || !target}
                onSelect={() => {
                  void runNavigation(kind, t(`editor.context.${id}`), options.peek);
                }}
              >
                <Icon size={14} aria-hidden="true" />
                {t(`editor.context.${id}`)}
              </ContextMenu.Item>
            ))}
            <ContextMenu.Separator className="my-1 h-px bg-iris-divider" />
            {editItems.map(({ id, icon: Icon }) => (
              <ContextMenu.Item
                key={id}
                disabled={disabled(id)}
                className={itemClass}
                onSelect={() => {
                  void runEdit(id);
                }}
              >
                <Icon size={14} aria-hidden="true" />
                {t(`editor.context.${id}`)}
              </ContextMenu.Item>
            ))}
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
      <EditorContextFeedback
        error={error}
        peek={peek}
        onDismissError={() => setError(null)}
        onClosePeek={closePeek}
        onNavigate={navigate}
      />
    </div>
  );
}
