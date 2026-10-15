import { expect, test } from "bun:test";
import { TypeScriptWorkerClient } from "./typescript-worker-client";
import { files, transport } from "./typescript-worker-test-helpers";

test("workspace subscribers observe readiness and changed snapshots but not identical writes", async () => {
  const fake = transport();
  const client = new TypeScriptWorkerClient(files, { createWorker: () => fake.worker });
  const revisions: number[] = [];
  const stop = client.subscribeWorkspace(() => revisions.push(client.workspaceVersion));
  fake.reply(fake.sent[0], { status: "ok", value: null });
  await client.syncWorkspace(files);
  await client.updateFile({ path: "other.ts", text: "export const value = 2;" });
  await client.updateFile({ path: "other.ts", text: "export const value = 2;" });
  expect(revisions).toEqual([1, 2]);
  stop();
  await client.updateFile({ path: "other.ts", text: "export const value = 3;" });
  expect(revisions).toEqual([1, 2]);
  client.dispose();
});

test("restores deduplicated worker source snapshots for navigation consumers", async () => {
  const fake = transport();
  const client = new TypeScriptWorkerClient(files, { createWorker: () => fake.worker });
  fake.reply(fake.sent[0], { status: "ok", value: null });
  const pending = client.references({ path: "app.ts", position: 6 });
  const request = fake.sent[1];
  const location = { path: "app.ts", from: 6, to: 11, line: 1, column: 7 };
  fake.reply(
    request,
    { status: "ok", value: [location, { ...location, from: 18, to: 23, column: 19 }] },
    { "app.ts": files[0].text },
  );
  expect(await pending).toEqual({
    status: "ok",
    value: [
      { ...location, source: files[0].text },
      { ...location, from: 18, to: 23, column: 19, source: files[0].text },
    ],
  });
  client.dispose();
});

test("publishes stable loading, ready and disposed status snapshots", () => {
  const fake = transport();
  const client = new TypeScriptWorkerClient(files, { createWorker: () => fake.worker });
  const states: string[] = [];
  const unsubscribe = client.subscribeStatus(() => states.push(client.getStatusSnapshot().state));
  const loading = client.getStatusSnapshot();
  expect(loading.state).toBe("loading");
  expect(client.getStatusSnapshot()).toBe(loading);
  fake.reply(fake.sent[0], { status: "ok", value: null });
  expect(client.getStatusSnapshot().state).toBe("ready");
  client.dispose();
  expect(states).toEqual(["ready", "disposed"]);
  unsubscribe();
});

test("publishes only changed files with monotonic versions and rejects stale replies", async () => {
  const fake = transport();
  const client = new TypeScriptWorkerClient(files, { createWorker: () => fake.worker });
  fake.reply(fake.sent[0], { status: "ok", value: null });
  await client.syncWorkspace([...files, { path: "other.ts", text: "export {}" }]);
  expect(fake.sent[1]).toMatchObject({
    kind: "update",
    workspaceVersion: 2,
    changes: [{ path: "other.ts", version: 1 }],
  });
  const pending = client.hover({ path: "app.ts", position: 6 });
  const request = fake.sent[2];
  await client.updateFile({ path: "app.ts", text: "const value = 2;" });
  fake.reply(request, { status: "ok", value: { signature: "old" } });
  expect(await pending).toEqual({ status: "cancelled" });
  expect(fake.sent[3]).toMatchObject({
    changes: [{ path: "app.ts", version: 2 }],
    workspaceVersion: 3,
  });
  await client.syncWorkspace([{ path: "other.ts", text: "export {}" }]);
  expect(fake.sent[4]).toMatchObject({ deleted: ["app.ts"] });
  client.dispose();
});

test("can defer worker creation until the first room update and initialize the latest files", async () => {
  const fake = transport();
  let created = 0;
  const client = new TypeScriptWorkerClient(files, {
    lazyStart: true,
    createWorker: () => {
      created++;
      return fake.worker;
    },
  });
  expect(created).toBe(0);
  await client.updateFile({ path: "app.ts", text: "const value = 2;" });
  expect(created).toBe(1);
  expect(fake.sent[0]).toMatchObject({
    kind: "initialize",
    files: [{ path: "app.ts", text: "const value = 2;", version: 2 }],
  });
  client.dispose();
});

test("timeout only discards that query and does not restart the worker", async () => {
  const fake = transport();
  const client = new TypeScriptWorkerClient(files, {
    createWorker: () => fake.worker,
  });
  fake.reply(fake.sent[0], { status: "ok", value: null });
  expect(await client.hover({ path: "app.ts", position: 6, timeoutMs: 1 })).toEqual({
    status: "timeout",
  });
  expect(fake.stopped()).toBe(0);
  client.dispose();
});

test("ignores a late query error after its timeout without restarting the worker", async () => {
  const workers = [transport(), transport()];
  let created = 0;
  const client = new TypeScriptWorkerClient(files, {
    createWorker: () => workers[created++].worker,
  });
  workers[0].reply(workers[0].sent[0], { status: "ok", value: null });
  const pending = client.hover({ path: "app.ts", position: 6, timeoutMs: 1 });
  const query = workers[0].sent[1];
  expect(await pending).toEqual({ status: "timeout" });
  workers[0].reply(query, { status: "error", message: "query failed" });
  expect(created).toBe(1);
  expect(workers[0].stopped()).toBe(0);
  client.dispose();
});

test("a failed update restarts from the latest snapshot instead of silently diverging", async () => {
  const workers = [transport(), transport()];
  let created = 0;
  const client = new TypeScriptWorkerClient(files, {
    createWorker: () => workers[created++].worker,
  });
  workers[0].reply(workers[0].sent[0], { status: "ok", value: null });
  await client.updateFile({ path: "app.ts", text: "const updated = true;" });
  workers[0].reply(workers[0].sent[1], { status: "error", message: "update rejected" });
  expect(created).toBe(2);
  expect(workers[1].sent[0]).toMatchObject({
    kind: "initialize",
    files: [{ path: "app.ts", text: "const updated = true;" }],
  });
  client.dispose();
});

test("a saturated update queue restarts once with the latest source snapshot", async () => {
  const workers = [transport(), transport()];
  let created = 0;
  const client = new TypeScriptWorkerClient(files, {
    createWorker: () => workers[created++].worker,
  });
  workers[0].reply(workers[0].sent[0], { status: "ok", value: null });
  for (let index = 0; index < 33; index++)
    await client.updateFile({ path: "app.ts", text: `const value = ${index};` });
  expect(created).toBe(2);
  expect(workers[0].stopped()).toBe(1);
  expect(workers[1].sent[0]).toMatchObject({
    kind: "initialize",
    files: [{ path: "app.ts", text: "const value = 32;" }],
  });
  workers[1].reply(workers[1].sent[0], { status: "ok", value: null });
  expect(client.getStatusSnapshot().state).toBe("ready");
  client.dispose();
});

test("releases deleted path versions and restarts a recreated path at version one", async () => {
  const fake = transport();
  const client = new TypeScriptWorkerClient(files, { createWorker: () => fake.worker });
  fake.reply(fake.sent[0], { status: "ok", value: null });
  await client.syncWorkspace([]);
  await client.syncWorkspace([{ path: "app.ts", text: "const recreated = true;" }]);
  expect(fake.sent.at(-1)).toMatchObject({
    kind: "update",
    changes: [{ path: "app.ts", version: 1 }],
  });
  client.dispose();
});

test("crash retries exactly once from latest snapshot then disables language services", async () => {
  const workers = [transport(), transport()];
  let created = 0;
  const client = new TypeScriptWorkerClient(files, {
    createWorker: () => workers[created++].worker,
  });
  workers[0].reply(workers[0].sent[0], { status: "ok", value: null });
  await client.updateFile({ path: "app.ts", text: "const value = 42; value;" });
  workers[0].crash();
  expect(workers[1].sent[0]).toMatchObject({
    kind: "initialize",
    epoch: 2,
    files: [{ path: "app.ts", text: "const value = 42; value;", version: 2 }],
  });
  workers[1].crash();
  expect(await client.hover({ path: "app.ts", position: 18 })).toMatchObject({
    status: "error",
    message: "TypeScript worker failed",
  });
  expect(created).toBe(2);
  expect(client.status).toBe("disabled");
  expect(client.getStatusSnapshot().state).toBe("unavailable");
  client.dispose();
});

test("initialization failure retries once and does not start a main-thread compiler", async () => {
  const workers = [transport(), transport()];
  let created = 0;
  const client = new TypeScriptWorkerClient(files, {
    createWorker: () => workers[created++].worker,
  });
  workers[0].reply(workers[0].sent[0], { status: "error", message: "init failed" });
  expect(created).toBe(2);
  expect(workers[1].sent[0]).toMatchObject({ kind: "initialize", epoch: 2 });
  workers[1].reply(workers[1].sent[0], { status: "error", message: "init failed again" });
  expect(await client.hover({ path: "app.ts", position: 6 })).toMatchObject({ status: "error" });
  expect(client.getStatusSnapshot().state).toBe("unavailable");
  client.dispose();
});

test("resource and unsafe path rejection never creates a worker", async () => {
  let created = 0;
  for (const snapshot of [
    [{ path: "../escape.ts", text: "" }],
    [{ path: "__typescript/lib/lib.es5.d.ts", text: "" }],
    [{ path: ".env/hidden.ts", text: "" }],
    [{ path: "node_modules/pkg/execute.ts", text: "" }],
    [{ path: "big.ts", text: "x".repeat(1024 * 1024 + 1) }],
    Array.from({ length: 513 }, (_, i) => ({ path: `${i}.ts`, text: "" })),
    Array.from({ length: 17 }, (_, i) => ({ path: `${i}.ts`, text: "x".repeat(1024 * 1024) })),
  ]) {
    const client = new TypeScriptWorkerClient(snapshot, {
      createWorker: () => {
        created++;
        return transport().worker;
      },
    });
    expect(await client.hover({ path: "big.ts", position: 0 })).toMatchObject({ status: "error" });
    client.dispose();
  }
  expect(created).toBe(0);
});

test("recovers from an over-budget snapshot after a valid workspace is synchronized", async () => {
  const fake = transport();
  const client = new TypeScriptWorkerClient(files, { createWorker: () => fake.worker });
  const listeners: string[] = [];
  client.subscribeStatus(() => listeners.push(client.getStatusSnapshot().state));
  const oversized = await client.syncWorkspace(
    Array.from({ length: 17 }, (_, index) => ({
      path: `file${index}.ts`,
      text: "x".repeat(1024 * 1024),
    })),
  );
  expect(oversized).toMatchObject({ status: "error" });
  expect(client.status).toBe("disabled");
  const recovered = await client.syncWorkspace(files);
  expect(recovered.status).toBe("ok");
  expect(client.status).toBe("worker");
  expect(client.getStatusSnapshot().state).toBe("loading");
  expect(fake.sent.at(-1)).toMatchObject({ kind: "initialize", files: expect.any(Array) });
  fake.reply(fake.sent.at(-1)!, { status: "ok", value: null });
  expect(client.getStatusSnapshot().state).toBe("ready");
  expect(listeners).toContain("unavailable");
  expect(listeners.at(-1)).toBe("ready");
  client.dispose();
});

test("requires a complete snapshot before recovering from rejected workspace edits", async () => {
  const fake = transport();
  const client = new TypeScriptWorkerClient(files, { createWorker: () => fake.worker });
  fake.reply(fake.sent[0], { status: "ok", value: null });
  await client.syncWorkspace([...files, { path: "big.ts", text: "x".repeat(1024 * 1024 + 1) }]);
  const updated = { path: "app.ts", text: "const value = 2; value;" };
  const repaired = { path: "big.ts", text: "const repaired = true;" };
  const updates = [await client.updateFile(updated), await client.updateFile(repaired)];
  const rejectedState = client.getStatusSnapshot().state;
  const messagesBeforeRecovery = fake.sent.length;
  const recovered = await client.syncWorkspace([updated, repaired]);
  const initialization = fake.sent.at(-1)!;
  fake.reply(initialization, { status: "ok", value: null });
  const recoveredState = client.getStatusSnapshot().state;
  client.dispose();
  expect(updates.map((result) => result.status)).toEqual(["error", "error"]);
  expect(rejectedState).toBe("unavailable");
  expect(messagesBeforeRecovery).toBe(1);
  expect(recovered.status).toBe("ok");
  expect(initialization).toMatchObject({
    kind: "initialize",
    files: [expect.objectContaining(updated), expect.objectContaining(repaired)],
  });
  expect(recoveredState).toBe("ready");
});

test("rejects unsafe query paths before sending them to the worker", async () => {
  const fake = transport();
  const client = new TypeScriptWorkerClient(files, { createWorker: () => fake.worker });
  fake.reply(fake.sent[0], { status: "ok", value: null });
  expect(await client.hover({ path: "../escape.ts", position: 0 })).toMatchObject({
    status: "error",
  });
  expect(fake.sent).toHaveLength(1);
  client.dispose();
});

test("publishes declaration metadata and enforces its independent byte budget", async () => {
  const fake = transport();
  const client = new TypeScriptWorkerClient(
    [
      ...files,
      { path: "node_modules/pkg/package.json", text: '{"types":"index.d.ts"}' },
      { path: "node_modules/pkg/index.d.ts", text: "export declare const value: number;" },
    ],
    { createWorker: () => fake.worker },
  );
  expect(fake.sent[0]).toMatchObject({
    kind: "initialize",
    files: expect.arrayContaining([
      expect.objectContaining({ path: "node_modules/pkg/package.json" }),
    ]),
  });
  const result = await client.syncWorkspace([
    ...files,
    ...Array.from({ length: 9 }, (_, index) => ({
      path: `node_modules/pkg/file${index}.d.ts`,
      text: "x".repeat(1024 * 1024),
    })),
  ]);
  expect(result).toMatchObject({
    status: "error",
    message: expect.stringContaining("declaration workspace limit"),
  });
  expect(client.status).toBe("disabled");
  client.dispose();
});

test("queue bounds, cancellation and disposal settle safely", async () => {
  const fake = transport();
  const client = new TypeScriptWorkerClient(files, { createWorker: () => fake.worker });
  fake.reply(fake.sent[0], { status: "ok", value: null });
  const pending = Array.from({ length: 32 }, (_, i) =>
    client.hover({ path: "app.ts", position: 0, requestId: `q${i}` }),
  );
  expect(await client.hover({ path: "app.ts", position: 0 })).toMatchObject({ status: "error" });
  client.cancel("q0");
  expect(await pending[0]).toEqual({ status: "cancelled" });
  client.dispose();
  client.dispose();
  expect(fake.stopped()).toBe(1);
  expect(
    (await Promise.all(pending.slice(1))).every((result) => result.status === "disposed"),
  ).toBe(true);
});
