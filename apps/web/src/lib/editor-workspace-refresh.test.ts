import { expect, test } from "bun:test";
import { EditorState } from "@codemirror/state";
import {
  createEditorWorkspaceRefreshScheduler,
  refreshEditorWorkspace,
} from "./editor-workspace-refresh";

test("workspace changes dispatch one refresh effect after the current update stack", async () => {
  const effects: number[] = [];
  const scheduler = createEditorWorkspaceRefreshScheduler(() => {
    const transaction = EditorState.create({ doc: "const value = 1;" }).update({
      effects: refreshEditorWorkspace.of(null),
    });
    if (transaction.effects.some((effect) => effect.is(refreshEditorWorkspace))) effects.push(1);
  });
  scheduler.notify();
  scheduler.notify();
  expect(effects).toEqual([]);
  await Promise.resolve();
  expect(effects).toEqual([1]);
  scheduler.dispose();
});

test("disposed schedulers drop queued workspace refreshes", async () => {
  const effects: number[] = [];
  const scheduler = createEditorWorkspaceRefreshScheduler(() => {
    effects.push(1);
  });
  scheduler.notify();
  scheduler.dispose();
  await Promise.resolve();
  expect(effects).toEqual([]);
});
