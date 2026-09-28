import { expect, test } from "bun:test";
import {
  ShikiWorkerClient,
  type HighlightWorker,
  type HighlightRequest,
} from "./shiki-worker-client";

const input = {
  source: "const n = 1",
  language: "typescript",
  theme: "vitesse-light",
  from: 0,
  to: 11,
} as const;
const spans = [{ from: 0, to: 5, color: "#123456", fontStyle: 0 }];

function fakeWorker() {
  const sent: HighlightRequest[] = [];
  let terminated = 0;
  const worker: HighlightWorker = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage: (request) => {
      sent.push(request);
    },
    terminate: () => {
      terminated++;
    },
  };
  return {
    worker,
    sent,
    terminated: () => terminated,
    reply: (id: number) => worker.onmessage?.({ data: { id, spans } } as MessageEvent),
  };
}

test("keeps only the newest pending document and discards stale colors", async () => {
  const fake = fakeWorker();
  const client = new ShikiWorkerClient(() => fake.worker);
  const first = client.highlight(input);
  const skipped = client.highlight({ ...input, source: "const n = 2" });
  const newest = client.highlight({ ...input, source: "const n = 3" });
  expect(fake.sent).toHaveLength(1);
  expect(await skipped).toBeUndefined();
  fake.reply(fake.sent[0].id);
  expect(await first).toBeUndefined();
  expect(fake.sent).toHaveLength(2);
  expect(fake.sent[1].source).toBe("const n = 3");
  fake.reply(fake.sent[1].id);
  expect(await newest).toEqual(spans);
  client.dispose();
});

test("settles outstanding work and terminates the worker when the editor is destroyed", async () => {
  const fake = fakeWorker();
  const client = new ShikiWorkerClient(() => fake.worker);
  const first = client.highlight(input);
  const second = client.highlight({ ...input, from: 5 });
  client.dispose();
  expect(await first).toBeUndefined();
  expect(await second).toBeUndefined();
  fake.reply(fake.sent[0].id);
  expect(fake.sent).toHaveLength(1);
  expect(await client.highlight(input)).toBeUndefined();
  expect(fake.terminated()).toBe(1);
});

test("cancels abandoned work but keeps an idle worker warm", async () => {
  const firstWorker = fakeWorker();
  const replacementWorker = fakeWorker();
  let creations = 0;
  const client = new ShikiWorkerClient(() =>
    creations++ === 0 ? firstWorker.worker : replacementWorker.worker,
  );

  const abandoned = client.highlight(input);
  client.cancelInFlight();
  expect(await abandoned).toBeUndefined();
  expect(firstWorker.terminated()).toBe(1);

  const restored = client.highlight(input);
  replacementWorker.reply(replacementWorker.sent[0].id);
  expect(await restored).toEqual(spans);
  client.cancelInFlight();
  const reused = client.highlight({ ...input, source: "const n = 2" });
  replacementWorker.reply(replacementWorker.sent[1].id);
  expect(await reused).toEqual(spans);
  expect(creations).toBe(2);
  client.dispose();
});

test("a stalled worker falls back instead of leaving the editor hidden", async () => {
  const fake = fakeWorker();
  const client = new ShikiWorkerClient(() => fake.worker, 10);
  expect(await client.highlight(input)).toEqual([]);
  expect(fake.terminated()).toBe(1);
  expect(await client.highlight(input)).toEqual([]);
});

for (const failure of ["onerror", "onmessageerror"] as const) {
  test(`falls back to native highlighting after worker ${failure}`, async () => {
    const fake = fakeWorker();
    const client = new ShikiWorkerClient(() => fake.worker);
    const first = client.highlight(input);
    const newest = client.highlight({ ...input, source: "const n = 2" });
    fake.worker[failure]?.({ preventDefault() {} } as ErrorEvent & MessageEvent);
    expect(await first).toEqual([]);
    expect(await newest).toEqual([]);
    expect(await client.highlight(input)).toEqual([]);
    expect(fake.terminated()).toBe(1);
  });
}

test("worker construction and posting failures do not break editor setup", async () => {
  const blocked = new ShikiWorkerClient(() => {
    throw new Error("worker blocked");
  });
  expect(await blocked.highlight(input)).toEqual([]);
  const fake = fakeWorker();
  fake.worker.postMessage = () => {
    throw new Error("worker disconnected");
  };
  const disconnected = new ShikiWorkerClient(() => fake.worker);
  expect(await disconnected.highlight(input)).toEqual([]);
  expect(fake.terminated()).toBe(1);
});

test("an unrelated response cannot resolve the active highlight", async () => {
  const fake = fakeWorker();
  const client = new ShikiWorkerClient(() => fake.worker);
  const result = client.highlight(input);
  let resolved = false;
  void result.then(() => {
    resolved = true;
  });
  fake.reply(fake.sent[0].id + 1);
  await Promise.resolve();
  expect(resolved).toBe(false);
  fake.reply(fake.sent[0].id);
  expect(await result).toEqual(spans);
  client.dispose();
});
