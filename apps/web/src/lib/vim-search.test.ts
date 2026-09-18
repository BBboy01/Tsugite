import { afterEach, expect, test } from "bun:test";
import { EditorState, type TransactionSpec } from "@codemirror/state";
import { SearchQuery, setSearchQuery } from "@codemirror/search";
import type { EditorView, ViewUpdate } from "@codemirror/view";

import { VimSearchStatus } from "./vim-search";

const plugins: VimSearchStatus[] = [];
afterEach(() => plugins.splice(0).forEach((plugin) => plugin.destroy?.()));

function setup(source = "alpha\nalpha\nalpha") {
  let scans = 0;
  const query = new SearchQuery({ search: "alpha" });
  const originalCursor = query.getCursor.bind(query);
  query.getCursor = (...args) => {
    scans++;
    return originalCursor(...args);
  };
  const view = {
    state: EditorState.create({ doc: source, selection: { anchor: 6 } }),
    cm: { cm6Query: Object.assign(query, { forVim: true }) },
    dispatch(spec: TransactionSpec) {
      const startState = view.state;
      const transaction = view.state.update(spec);
      view.state = transaction.state;
      plugin.update({
        view: view as unknown as EditorView,
        state: transaction.state,
        startState,
        docChanged: transaction.docChanged,
        changes: transaction.changes,
        transactions: [transaction],
        viewportChanged: false,
        viewportMoved: false,
        heightChanged: false,
        geometryChanged: false,
        focusChanged: false,
        selectionSet: transaction.selection !== undefined,
        empty: false,
      } as ViewUpdate);
    },
  };
  const plugin = new VimSearchStatus(view as unknown as EditorView);
  plugins.push(plugin);
  const edit = () => view.dispatch({ changes: { from: view.state.doc.length, insert: "\nalpha" } });
  return { view, plugin, edit, scans: () => scans };
}

test("coalesces repeated text edits before rescanning the full search", async () => {
  const { plugin, scans, edit } = setup();
  expect(scans()).toBe(1);
  for (let index = 0; index < 20; index++) edit();
  expect(scans()).toBe(1);
  await Bun.sleep(160);
  expect(scans()).toBe(2);
  const widgets: unknown[] = [];
  plugin.decorations.between(0, 1000, (_from, _to, decoration) => {
    widgets.push(decoration.spec.widget);
  });
  expect(widgets).toMatchObject([{ current: 2, total: 23 }]);
});

test("new search queries refresh immediately and cancel a pending recount", async () => {
  const { view, plugin, scans, edit } = setup();
  edit();
  const query = Object.assign(new SearchQuery({ search: "missing" }), { forVim: true });
  view.cm.cm6Query = query;
  view.dispatch({ effects: setSearchQuery.of(query) });
  expect(plugin.decorations.size).toBe(0);
  const count = scans();
  await Bun.sleep(160);
  expect(scans()).toBe(count);
});

test("destroy cancels pending search work", async () => {
  const { plugin, scans, edit } = setup();
  edit();
  plugin.destroy();
  await Bun.sleep(160);
  expect(scans()).toBe(1);
});

test("keeps exact match counts in long documents after a burst of edits", async () => {
  const { view, plugin, scans, edit } = setup("alpha\n".repeat(20_000));
  for (let index = 0; index < 50; index++) edit();
  expect(scans()).toBe(1);
  await Bun.sleep(160);
  expect(scans()).toBe(2);
  const widgets: unknown[] = [];
  plugin.decorations.between(0, view.state.doc.length, (_from, _to, decoration) => {
    widgets.push(decoration.spec.widget);
  });
  expect(widgets).toMatchObject([{ current: 2, total: 20_050 }]);
});
