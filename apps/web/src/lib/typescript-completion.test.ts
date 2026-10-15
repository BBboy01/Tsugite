import { expect, test } from "bun:test";
import {
  CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from "@codemirror/autocomplete";
import { javascript } from "@codemirror/lang-javascript";
import { EditorState } from "@codemirror/state";
import { editorBasicSetup } from "./editor-basic-setup";
import type { EditorIntelligence } from "./editor-intelligence";
import { typeScriptCompletion } from "./typescript-completion";

test("JavaScript and TypeScript completions keep the language's for-loop snippets", async () => {
  const intelligence = {
    completion: async () => ({
      status: "ok",
      value: [{ name: "format", kind: "function", sortText: "0" }],
    }),
  } as unknown as EditorIntelligence;
  for (const typescript of [false, true]) {
    const state = EditorState.create({
      doc: "for",
      extensions: [
        editorBasicSetup(),
        javascript({ typescript }),
        typeScriptCompletion(intelligence, "app.ts"),
      ],
    });
    const context = new CompletionContext(state, 3, true);
    const sources = state.languageDataAt<CompletionSource>("autocomplete", 3);
    const results = await Promise.all(sources.map((source) => source(context)));
    const options = results.flatMap((result) => (result as CompletionResult | null)?.options ?? []);

    expect(options).toContainEqual(expect.objectContaining({ label: "format" }));
    expect(options).toContainEqual(
      expect.objectContaining({ label: "for", detail: "loop", apply: expect.any(Function) }),
    );
  }
});
