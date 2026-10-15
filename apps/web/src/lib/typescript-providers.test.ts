import { expect, test } from "bun:test";
import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { EditorIntelligence } from "./editor-intelligence";
import { createCompletionSource } from "./typescript-completion";
import { querySignatureHelp } from "./typescript-signature";

test("signature help is requested at a caret without a selection", async () => {
  const calls: unknown[] = [];
  const intelligence = {
    workspaceVersion: 4,
    signatureHelp: async (query: unknown) => {
      calls.push(query);
      return {
        status: "ok",
        value: { signatures: [], activeSignature: 0, activeParameter: 0 },
      };
    },
  } as unknown as EditorIntelligence;
  const doc = { length: 12 };
  const view = { state: { doc } } as unknown as EditorView;
  const result = await querySignatureHelp(intelligence, "app.ts", view, 10, {
    requestId: "signature-1",
  });
  expect(calls).toEqual([
    { path: "app.ts", position: 10, requestId: "signature-1", timeoutMs: 2000 },
  ]);
  expect(result).toMatchObject({ pos: 10 });
});

test("signature help ignores results requested before the editor selection changed", async () => {
  let resolve:
    | ((value: {
        status: "ok";
        value: { signatures: []; activeSignature: 0; activeParameter: 0 };
      }) => void)
    | undefined;
  const intelligence = {
    signatureHelp: () =>
      new Promise((done) => {
        resolve = done;
      }),
  } as unknown as EditorIntelligence;
  const doc = { length: 12 };
  const firstSelection = { main: { head: 10 } };
  const view = { state: { doc, selection: firstSelection } } as unknown as EditorView;
  const pending = querySignatureHelp(intelligence, "app.ts", view, 10);
  (view.state as { doc: object; selection: object }).selection = { main: { head: 2 } };
  resolve?.({ status: "ok", value: { signatures: [], activeSignature: 0, activeParameter: 0 } });
  expect(await pending).toBeNull();
});

test("signature help ignores results from an outdated workspace", async () => {
  let workspaceVersion = 1;
  let resolve:
    | ((value: {
        status: "ok";
        value: { signatures: []; activeSignature: 0; activeParameter: 0 };
      }) => void)
    | undefined;
  const intelligence = {
    get workspaceVersion() {
      return workspaceVersion;
    },
    signatureHelp: () =>
      new Promise((done) => {
        resolve = done;
      }),
  } as unknown as EditorIntelligence;
  const view = {
    state: { doc: { length: 12 }, selection: { main: { head: 10 } } },
  } as unknown as EditorView;
  const pending = querySignatureHelp(intelligence, "app.ts", view, 10);
  workspaceVersion++;
  resolve?.({ status: "ok", value: { signatures: [], activeSignature: 0, activeParameter: 0 } });
  expect(await pending).toBeNull();
});

test("completion abort cancels its stable intelligence request", async () => {
  let abort: (() => void) | undefined;
  let requestId = "";
  let cancelled = "";
  const intelligence = {
    completion: async (query: { requestId: string }) => {
      requestId = query.requestId;
      return new Promise(() => {});
    },
    cancel: (id: string) => {
      cancelled = id;
    },
  } as unknown as EditorIntelligence;
  const doc = { length: 10 };
  const source = createCompletionSource(intelligence, "app.ts");
  const pending = source({
    state: { doc },
    explicit: true,
    matchBefore: () => null,
    pos: 5,
    aborted: false,
    addEventListener: (_type: "abort", listener: () => void) => {
      abort = listener;
    },
  } as unknown as CompletionContext);
  abort?.();
  expect(requestId).toMatch(/^completion-/);
  expect(cancelled).toBe(requestId);
  void pending;
});

test("automatic completions do not query after statements or whitespace", async () => {
  let calls = 0;
  const intelligence = {
    completion: async () => {
      calls++;
      return { status: "empty" };
    },
  } as unknown as EditorIntelligence;
  const source = createCompletionSource(intelligence, "app.ts");
  for (const doc of ["const count = 1;", "add(1, 2);", "\n", " ", '"text"']) {
    expect(
      await source(new CompletionContext(EditorState.create({ doc }), doc.length, false)),
    ).toBeNull();
  }
  expect(calls).toBe(0);
  for (const doc of ["con", "document.", ""]) {
    await source(new CompletionContext(EditorState.create({ doc }), doc.length, doc.length === 0));
  }
  expect(calls).toBe(3);
});

test("completion replaces the typed identifier when TypeScript omits a replacement span", async () => {
  const intelligence = {
    completion: async () => ({
      status: "ok",
      value: [{ name: "console", kind: "var", sortText: "0" }],
    }),
  } as unknown as EditorIntelligence;
  const context = new CompletionContext(EditorState.create({ doc: "con" }), 3, true);
  const result = await createCompletionSource(intelligence, "app.ts")(context);
  expect(result?.from).toBe(0);
  expect(result?.options[0].apply).toBe("console");
});

test("completion ignores results from an outdated workspace", async () => {
  let workspaceVersion = 1;
  let finish: (() => void) | undefined;
  const intelligence = {
    get workspaceVersion() {
      return workspaceVersion;
    },
    completion: () =>
      new Promise((resolve) => {
        finish = () =>
          resolve({
            status: "ok",
            value: [{ name: "console", kind: "var", sortText: "0" }],
          });
      }),
  } as unknown as EditorIntelligence;
  const context = new CompletionContext(EditorState.create({ doc: "con" }), 3, true);
  const pending = createCompletionSource(intelligence, "app.ts")(context);
  workspaceVersion++;
  finish?.();
  expect(await pending).toBeNull();
});

test("completion sources use request IDs unique across editor instances", async () => {
  const requestIds: string[] = [];
  const intelligence = {
    completion: async (query: { requestId?: string }) => {
      requestIds.push(query.requestId ?? "");
      return { status: "empty" };
    },
  } as unknown as EditorIntelligence;
  const first = createCompletionSource(intelligence, "app.ts");
  const second = createCompletionSource(intelligence, "app.ts");
  const firstContext = new CompletionContext(EditorState.create({ doc: "con" }), 3, true);
  const secondContext = new CompletionContext(EditorState.create({ doc: "con" }), 3, true);

  await Promise.all([first(firstContext), second(secondContext)]);

  expect(requestIds).toHaveLength(2);
  expect(new Set(requestIds).size).toBe(2);
});
