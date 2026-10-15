import { expect, test } from "bun:test";
import { TypeScriptWorkerClient, type TypeScriptWorkerMetrics } from "./typescript-worker-client";
import { createTypeScriptIntelligence } from "./typescript-intelligence";
import { files, transport } from "./typescript-worker-test-helpers";

test("reports status metrics for a worker that becomes ready", () => {
  const fake = transport();
  const samples: unknown[] = [];
  const client = new TypeScriptWorkerClient(files, {
    createWorker: () => fake.worker,
    onMetrics: (metrics) => samples.push(metrics),
  });

  expect(client.getMetricsSnapshot()).toEqual({
    workerStarts: 1,
    workerRetries: 0,
    readyCount: 0,
    fallbackCount: 0,
    unavailableCount: 0,
  });
  fake.reply(fake.sent[0], { status: "ok", value: null });
  expect(client.getMetricsSnapshot()).toEqual({
    workerStarts: 1,
    workerRetries: 0,
    readyCount: 1,
    fallbackCount: 0,
    unavailableCount: 0,
  });
  expect(samples.at(-1)).toEqual(client.getMetricsSnapshot());
  client.dispose();
});

test("reports a retry followed by a main-thread fallback", async () => {
  const workers = [transport(), transport()];
  let created = 0;
  const client = new TypeScriptWorkerClient(files, {
    createWorker: () => workers[created++].worker,
    createFallback: (snapshot) =>
      createTypeScriptIntelligence(snapshot[0]!.path, snapshot[0]!.text, snapshot),
  });
  workers[0].reply(workers[0].sent[0], { status: "ok", value: null });
  workers[0].crash();
  workers[1].crash();
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(client.getMetricsSnapshot()).toMatchObject({
    workerStarts: 2,
    workerRetries: 1,
    readyCount: 1,
    fallbackCount: 1,
    unavailableCount: 0,
  });
  client.dispose();
});

test("reports unavailable after the worker retry is exhausted", async () => {
  const workers = [transport(), transport()];
  let created = 0;
  const client = new TypeScriptWorkerClient(files, {
    createWorker: () => workers[created++].worker,
  });
  workers[0].reply(workers[0].sent[0], { status: "ok", value: null });
  workers[0].crash();
  workers[1].crash();
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(client.getMetricsSnapshot()).toMatchObject({
    workerStarts: 2,
    workerRetries: 1,
    readyCount: 1,
    fallbackCount: 0,
    unavailableCount: 1,
  });
  client.dispose();
});

test("isolates a throwing metrics sink from readiness, queries and disposal", async () => {
  const fake = transport();
  const client = new TypeScriptWorkerClient(files, {
    createWorker: () => fake.worker,
    onMetrics: () => {
      throw new Error("Metrics sink is unavailable");
    },
  });
  const states: string[] = [];
  client.subscribeStatus(() => states.push(client.getStatusSnapshot().state));
  fake.reply(fake.sent[0], { status: "ok", value: null });
  const pending = client.hover({ path: "app.ts", position: 6 });
  fake.reply(fake.sent[1], {
    status: "ok",
    value: { from: 0, to: 5, signature: "const value: 1", documentation: "" },
  });

  expect(await pending).toEqual({
    status: "ok",
    value: { from: 0, to: 5, signature: "const value: 1", documentation: "" },
  });
  client.dispose();
  expect(states).toEqual(["ready", "disposed"]);
  expect(fake.stopped()).toBe(1);
  expect(client.getMetricsSnapshot().readyCount).toBe(1);
});

test("isolates returned and emitted metrics snapshots from internal counters", () => {
  const fake = transport();
  const samples: TypeScriptWorkerMetrics[] = [];
  const client = new TypeScriptWorkerClient(files, {
    createWorker: () => fake.worker,
    onMetrics: (metrics) => {
      samples.push(metrics);
      Object.assign(metrics, { workerStarts: -1, readyCount: -1 });
    },
  });
  const snapshot = client.getMetricsSnapshot();
  Object.assign(snapshot, { workerStarts: -2, readyCount: -2 });
  fake.reply(fake.sent[0], { status: "ok", value: null });

  expect(snapshot).toMatchObject({ workerStarts: -2, readyCount: -2 });
  expect(samples[0]).toMatchObject({ workerStarts: -1, readyCount: -1 });
  expect(client.getMetricsSnapshot()).toEqual({
    workerStarts: 1,
    workerRetries: 0,
    readyCount: 1,
    fallbackCount: 0,
    unavailableCount: 0,
  });
  client.dispose();
});
