import { expect, test } from "bun:test";
import { TypeScriptWorkerSession } from "./typescript-worker-session";
import { createTypeScriptIntelligence } from "./typescript-intelligence";
import type { EditorIntelligence } from "./editor-intelligence";

test("real engine serializes incremental edits, deletions, UTF-16 and rejects stale versions", async () => {
  const session = new TypeScriptWorkerSession((files) =>
    createTypeScriptIntelligence(files[0].path, files[0].text, files),
  );
  const source = 'const emoji = "😀"; const value = 1; value;';
  const envelope = { epoch: 1, requestId: "init", workspaceVersion: 1 };
  expect(
    (
      await session.enqueue({
        ...envelope,
        kind: "initialize",
        files: [{ path: "app.ts", text: source, version: 1 }],
      })
    ).result.status,
  ).toBe("ok");
  const result = await session.enqueue({
    ...envelope,
    requestId: "q",
    kind: "query",
    method: "hover",
    query: { path: "app.ts", position: source.lastIndexOf("value") },
  });
  expect(result.result).toMatchObject({
    status: "ok",
    value: { signature: "const value: 1", from: source.lastIndexOf("value") },
  });
  await session.enqueue({
    epoch: 1,
    requestId: "update",
    workspaceVersion: 2,
    kind: "update",
    changes: [{ path: "app.ts", text: "const value = 2; value;", version: 2 }],
    deleted: [],
  });
  expect(
    (
      await session.enqueue({
        ...envelope,
        requestId: "stale",
        kind: "query",
        method: "hover",
        query: { path: "app.ts", position: 6 },
      })
    ).result.status,
  ).toBe("cancelled");
  expect(
    (
      await session.enqueue({
        epoch: 1,
        requestId: "bad",
        workspaceVersion: 3,
        kind: "update",
        changes: [{ path: "app.ts", text: "old", version: 1 }],
        deleted: [],
      })
    ).result.status,
  ).toBe("error");
  await session.enqueue({
    epoch: 1,
    requestId: "delete",
    workspaceVersion: 3,
    kind: "update",
    changes: [],
    deleted: ["app.ts"],
  });
  expect(
    (
      await session.enqueue({
        epoch: 1,
        requestId: "gone",
        workspaceVersion: 3,
        kind: "query",
        method: "hover",
        query: { path: "app.ts", position: 0 },
      })
    ).result.status,
  ).toBe("empty");
  expect(
    (
      await session.enqueue({
        epoch: 1,
        requestId: "recreate",
        workspaceVersion: 4,
        kind: "update",
        changes: [{ path: "app.ts", text: "const recreated = true;", version: 1 }],
        deleted: [],
      })
    ).result.status,
  ).toBe("ok");
  session.dispose();
});

test("cancellation during initialization prevents the queued query from running", async () => {
  const creation = Promise.withResolvers<EditorIntelligence>();
  let queries = 0;
  const session = new TypeScriptWorkerSession(() => creation.promise);
  const initializing = session.enqueue({
    epoch: 1,
    requestId: "init",
    workspaceVersion: 1,
    kind: "initialize",
    files: [{ path: "app.ts", text: "const value = 1;", version: 1 }],
  });
  const query = session.enqueue({
    epoch: 1,
    requestId: "query",
    workspaceVersion: 1,
    kind: "query",
    method: "hover",
    query: { path: "app.ts", position: 0 },
  });
  await session.enqueue({
    epoch: 1,
    requestId: "cancel",
    workspaceVersion: 1,
    kind: "cancel",
    target: "query",
  });
  creation.resolve({
    dispose() {},
    cancel() {},
    async hover() {
      queries++;
      return { status: "empty" };
    },
  } as unknown as EditorIntelligence);
  await initializing;
  expect((await query).result.status).toBe("cancelled");
  expect(queries).toBe(0);
  session.dispose();
});

test("worker independently refuses unsafe snapshots before creating an engine", async () => {
  let created = 0;
  const session = new TypeScriptWorkerSession(() => {
    created++;
    throw new Error("unexpected");
  });
  const result = await session.enqueue({
    epoch: 1,
    requestId: "init",
    workspaceVersion: 1,
    kind: "initialize",
    files: [{ path: "../bad.ts", text: "", version: 1 }],
  });
  expect(result.result.status).toBe("error");
  expect(created).toBe(0);
});

test("worker independently rejects unsafe query paths", async () => {
  const session = new TypeScriptWorkerSession((files) =>
    createTypeScriptIntelligence(files[0].path, files[0].text, files),
  );
  await session.enqueue({
    epoch: 1,
    requestId: "init",
    workspaceVersion: 1,
    kind: "initialize",
    files: [{ path: "app.ts", text: "const value = 1;", version: 1 }],
  });
  const result = await session.enqueue({
    epoch: 1,
    requestId: "unsafe",
    workspaceVersion: 1,
    kind: "query",
    method: "hover",
    query: { path: "../escape.ts", position: 0 },
  });
  expect(result.result).toMatchObject({ status: "error" });
  session.dispose();
});

test("navigation replies deduplicate source snapshots for repeated locations", async () => {
  const source = "x".repeat(7000);
  const makeSession = (count: number) => {
    const engine = {
      dispose() {},
      cancel() {},
      references: async () => ({
        status: "ok",
        value: Array.from({ length: count }, (_, from) => ({
          path: "app.ts",
          from,
          to: from + 1,
          line: 1,
          column: from + 1,
          source,
        })),
      }),
    } as unknown as EditorIntelligence;
    return new TypeScriptWorkerSession(() => engine);
  };
  const initialize = {
    epoch: 1,
    requestId: "init",
    workspaceVersion: 1,
    kind: "initialize" as const,
    files: [{ path: "app.ts", text: "x;", version: 1 }],
  };
  const compact = makeSession(1001);
  await compact.enqueue(initialize);
  const result = await compact.enqueue({
    epoch: 1,
    requestId: "refs",
    workspaceVersion: 1,
    kind: "query",
    method: "references",
    query: { path: "app.ts", position: 0 },
  });
  expect(result.result.status).toBe("ok");
  expect(result.sourceSnapshots).toEqual({ "app.ts": source });
  expect(JSON.stringify(result).length).toBeLessThan(80_000);
  expect((result.result as { value: Record<string, unknown>[] }).value[0]).not.toHaveProperty(
    "source",
  );
  compact.dispose();
});
