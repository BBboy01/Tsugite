import { describe, expect, spyOn, test } from "bun:test";
import { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { LoroDoc } from "loro-crdt";
import { createFile, deleteFile, renameFile } from "@iris/shared";
import type { EditorIntelligence } from "./editor-intelligence";
import { attachEditorTypeScriptServices } from "./editor-typescript-services";

const source = "import { value } from './value';\nvalue;";
const query = { path: "app.ts", position: source.lastIndexOf("value") };

async function attach(doc: LoroDoc) {
  let detach!: () => void;
  const intelligence = await new Promise<EditorIntelligence>((resolve) => {
    const view = {
      state: EditorState.create({ doc: source }),
      dispatch() {},
    } as unknown as EditorView;
    detach = attachEditorTypeScriptServices(view, "app.ts", doc, resolve);
  });
  return { intelligence, detach };
}

async function signature(intelligence: EditorIntelligence) {
  const result = await intelligence.hover(query);
  expect(result.status).toBe("ok");
  if (result.status !== "ok") throw new Error(`Expected hover, received ${result.status}`);
  return result.value.signature;
}

describe("editor TypeScript workspace synchronization", () => {
  test("refreshes an active file's types after a non-active Loro text edit", async () => {
    const doc = new LoroDoc();
    createFile(doc, "app.ts", "typescript", source);
    const dependency = createFile(doc, "value.ts", "typescript", "export const value = 1;");
    doc.commit();
    const { intelligence, detach } = await attach(doc);
    try {
      expect(await signature(intelligence)).toContain("value: 1");
      dependency.text.update("export const value = true;");
      doc.commit();
      expect(await signature(intelligence)).toContain("value: true");
    } finally {
      detach();
    }
  });

  test("refreshes imports when a non-active file is created, renamed or deleted", async () => {
    const doc = new LoroDoc();
    createFile(doc, "app.ts", "typescript", source);
    doc.commit();
    const { intelligence, detach } = await attach(doc);
    try {
      const dependency = createFile(doc, "value.ts", "typescript", "export const value = 1;");
      doc.commit();
      expect(await signature(intelligence)).toContain("value: 1");
      renameFile(doc, dependency.id, "moved.ts");
      doc.commit();
      expect(await signature(intelligence)).not.toContain("value: 1");
      renameFile(doc, dependency.id, "value.ts");
      doc.commit();
      expect(await signature(intelligence)).toContain("value: 1");
      deleteFile(doc, dependency.id);
      doc.commit();
      expect(await signature(intelligence)).not.toContain("value: 1");
    } finally {
      detach();
    }
  });

  test("unsubscribes before disposing the adapter", async () => {
    const doc = new LoroDoc();
    createFile(doc, "app.ts", "typescript", source);
    const dependency = createFile(doc, "value.ts", "typescript", "export const value = 1;");
    doc.commit();
    const { intelligence, detach } = await attach(doc);
    const sync = spyOn(intelligence, "syncWorkspace");
    dependency.text.update("export const value = false;");
    doc.commit();
    expect(await signature(intelligence)).toContain("value: false");
    expect(sync).toHaveBeenCalledTimes(1);
    sync.mockClear();
    detach();
    dependency.text.update("export const value = true;");
    doc.commit();
    await Promise.resolve();
    expect(sync).not.toHaveBeenCalled();
    expect(await intelligence.hover(query)).toEqual({ status: "disposed" });
    sync.mockRestore();
  });
});
