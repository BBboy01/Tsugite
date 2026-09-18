import { SearchQuery, setSearchQuery } from "@codemirror/search";
import { StateEffect } from "@codemirror/state";
import {
  Decoration,
  type EditorView,
  WidgetType,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { Vim, getCM } from "@replit/codemirror-vim";

type VimSearchQuery = SearchQuery & { forVim?: boolean };

const vimSearchNavigated = StateEffect.define<void>();
const vimSearchRecount = StateEffect.define<void>();

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatSearchQuery(value: string): string {
  const withoutWordBoundaries =
    value.startsWith("\\b") && value.endsWith("\\b") ? value.slice(2, -2) : value;
  return withoutWordBoundaries.replace(/\\([\\.*+?()[\]{}|^$])/g, "$1");
}

function getVimSearchQuery(view: EditorView): SearchQuery | null {
  const vimQuery = getCM(view)?.cm6Query as VimSearchQuery | undefined;
  if (vimQuery?.forVim && vimQuery.valid && vimQuery.search) return vimQuery;
  return null;
}

class VimSearchStatusWidget extends WidgetType {
  constructor(
    private readonly query: string,
    private readonly current: number,
    private readonly total: number,
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const element = document.createElement("span");
    element.className = "cm-vim-search-status";
    element.dataset.vimSearchStatus = "true";
    const label = formatSearchQuery(this.query);
    const query = document.createElement("span");
    query.dataset.vimSearchQuery = "true";
    query.textContent = label;
    const count = document.createElement("span");
    count.className = "cm-vim-search-count";
    count.dataset.vimSearchCount = "true";
    count.textContent = `${this.current}/${this.total}`;
    element.append(query, count);
    element.setAttribute("aria-label", `Search ${label}, match ${this.current} of ${this.total}`);
    return element;
  }

  eq(other: VimSearchStatusWidget): boolean {
    return (
      this.query === other.query && this.current === other.current && this.total === other.total
    );
  }
}

function getSearchMatches(
  view: EditorView,
  query: SearchQuery,
): Array<{ from: number; to: number }> {
  const cursor = query.getCursor(view.state);
  const matches: Array<{ from: number; to: number }> = [];
  for (let match = cursor.next(); !match.done; match = cursor.next()) {
    matches.push(match.value);
  }
  return matches;
}

function getCurrentMatch(view: EditorView, matches: Array<{ from: number; to: number }>): number {
  const position = view.state.selection.main.head;
  const containing = matches.findIndex(({ from, to }) => position >= from && position <= to);
  if (containing >= 0) return containing;
  const following = matches.findIndex(({ from }) => from >= position);
  return following >= 0 ? following : 0;
}

export class VimSearchStatus {
  decorations = Decoration.none;
  private activeMatchFrom: number | null = null;
  private activeQuery: SearchQuery | null = null;
  private recountTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(readonly view: EditorView) {
    this.decorations = this.buildDecorations(true);
  }

  update(update: ViewUpdate) {
    const queryChanged = update.transactions.some((transaction) =>
      transaction.effects.some((effect) => effect.is(setSearchQuery)),
    );
    const searchNavigated = update.transactions.some((transaction) =>
      transaction.effects.some((effect) => effect.is(vimSearchNavigated)),
    );
    const recount = update.transactions.some((transaction) =>
      transaction.effects.some((effect) => effect.is(vimSearchRecount)),
    );
    if (!update.docChanged && !queryChanged && !searchNavigated && !recount) return;
    if (update.docChanged && this.activeMatchFrom !== null) {
      this.activeMatchFrom = update.changes.mapPos(this.activeMatchFrom);
    }
    if (update.docChanged && !queryChanged && !searchNavigated && !recount) {
      this.decorations = this.decorations.map(update.changes);
      if (getVimSearchQuery(this.view) && this.recountTimer === undefined) {
        this.recountTimer = setTimeout(() => {
          this.recountTimer = undefined;
          this.view.dispatch({ effects: vimSearchRecount.of() });
        }, 100);
      }
      return;
    }
    clearTimeout(this.recountTimer);
    this.recountTimer = undefined;
    this.decorations = this.buildDecorations(queryChanged || searchNavigated);
  }

  destroy() {
    clearTimeout(this.recountTimer);
    this.recountTimer = undefined;
  }

  buildDecorations(refreshActiveMatch: boolean) {
    const query = getVimSearchQuery(this.view);
    if (!query || this.view.state.selection.ranges.length !== 1) {
      this.activeMatchFrom = null;
      this.activeQuery = null;
      return Decoration.none;
    }

    const matches = getSearchMatches(this.view, query);
    if (matches.length === 0) {
      this.activeMatchFrom = null;
      this.activeQuery = query;
      return Decoration.none;
    }

    const existingMatch = matches.findIndex(({ from }) => from === this.activeMatchFrom);
    let current = existingMatch;
    if (refreshActiveMatch || this.activeQuery !== query || current < 0) {
      current = getCurrentMatch(this.view, matches);
    }

    this.activeMatchFrom = matches[current].from;
    this.activeQuery = query;
    const line = this.view.state.doc.lineAt(matches[current].from);
    return Decoration.set([
      Decoration.widget({
        side: 1,
        widget: new VimSearchStatusWidget(query.search, current + 1, matches.length),
      }).range(line.to),
    ]);
  }
}

const vimSearchStatus = ViewPlugin.fromClass(VimSearchStatus, {
  decorations: (value) => value.decorations,
});

function searchVisualSelection(view: EditorView): boolean {
  const cm = getCM(view);
  if (!cm?.state.vim?.visualMode || !cm.somethingSelected()) return false;

  const selected = cm.getSelection();
  if (!selected) return false;
  const ranges = cm.listSelections();
  const range = ranges[0];
  const from = cm.indexFromPos(range.anchor);
  const to = cm.indexFromPos(range.head);
  const end = Math.max(from, to);
  const vimPattern = escapeRegex(selected);
  const { getVimGlobalState_: getVimGlobalState } = Vim;
  const vimState = getVimGlobalState();
  vimState.query = new RegExp(vimPattern, "i");
  vimState.isReversed = false;
  Vim.getRegisterController().getRegister("/").setText(vimPattern);
  const query = new SearchQuery({ search: selected, literal: true }) as VimSearchQuery;
  query.forVim = true;

  Vim.exitVisualMode(cm as Parameters<typeof Vim.exitVisualMode>[0], false);
  view.dispatch({ selection: { anchor: end } });
  Vim.handleKey(cm, "n", "user");
  cm.cm6Query = query;
  view.dispatch({ effects: setSearchQuery.of(query) });
  return true;
}

export function attachVimSearch(view: EditorView): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    const cm = getCM(view);
    const navigatesSearch =
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !cm?.state.vim?.insertMode &&
      (event.key === "n" || event.key === "N");
    if (navigatesSearch) {
      window.setTimeout(() => {
        if (view.dom.isConnected) view.dispatch({ effects: vimSearchNavigated.of() });
      }, 0);
      return;
    }

    if (event.key === "*" && searchVisualSelection(view)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };

  view.dom.addEventListener("keydown", onKeyDown, true);
  return () => view.dom.removeEventListener("keydown", onKeyDown, true);
}

export const vimSearchExtension = vimSearchStatus;
