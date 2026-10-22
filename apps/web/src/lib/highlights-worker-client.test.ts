import { expect, test } from "bun:test";

import type { HighlightEdit, HighlightSpan } from "./highlights-engine";
import {
  HighlightsWorkerClient,
  type HighlightsRequest,
  type HighlightsWorker,
} from "./highlights-worker-client";

const input = {
  source: "const n = 1",
  edits: [] as readonly HighlightEdit[],
  language: "typescript" as const,
  theme: "paper" as const,
  viewport: [0, 1] as const,
  lineOffsets: [0] as const,
};
const spans: HighlightSpan[] = [{ from: 0, to: 5, color: "#123456", fontStyle: 0 }];

function fakeWorker() {
  const sent: HighlightsRequest[] = [];
  let terminated = 0;
  const worker: HighlightsWorker = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage: (request) => {
      sent.push(request);
    },
    terminate: () => {
      terminated += 1;
    },
  };
  return {
    worker,
    sent,
    terminated: () => terminated,
    reply: (id: number) => worker.onmessage?.({ data: { id, spans, ready: true } } as MessageEvent),
  };
}

test("resets once, then sends only UTF-16 edits to the live worker session", async () => {
  const fake = fakeWorker();
  const client = new HighlightsWorkerClient(() => fake.worker);

  const first = client.highlight(input);
  expect(fake.sent[0]).toMatchObject({ reset: true, source: input.source, edits: [] });
  fake.reply(fake.sent[0].id);
  expect(await first).toEqual(spans);

  const edits: readonly HighlightEdit[] = [
    {
      range: { start: { line: 0, character: 10 }, end: { line: 0, character: 11 } },
      newText: "2",
    },
  ];
  const second = client.highlight({ ...input, source: "", edits });
  expect(fake.sent[1]).toMatchObject({ reset: false, edits, source: undefined });
  fake.reply(fake.sent[1].id);
  expect(await second).toEqual(spans);
  client.dispose();
});

test("keeps only the newest pending request and discards stale colors", async () => {
  const fake = fakeWorker();
  const client = new HighlightsWorkerClient(() => fake.worker);
  const first = client.highlight(input);
  const skipped = client.highlight({ ...input, source: "const n = 2" });
  const newest = client.highlight({ ...input, source: "const n = 3" });
  expect(fake.sent).toHaveLength(1);
  expect(await skipped).toBeUndefined();
  fake.reply(fake.sent[0].id);
  expect(await first).toBeUndefined();
  expect(fake.sent).toHaveLength(2);
  expect(fake.sent[1]).toMatchObject({ reset: false, edits: [], source: undefined });
  fake.reply(fake.sent[1].id);
  expect(await newest).toEqual(spans);
  client.dispose();
});

test("forces a full reset after cancellation before reusing the worker client", async () => {
  const firstWorker = fakeWorker();
  const replacementWorker = fakeWorker();
  let creations = 0;
  const client = new HighlightsWorkerClient(() =>
    creations++ === 0 ? firstWorker.worker : replacementWorker.worker,
  );

  const abandoned = client.highlight(input);
  client.cancelInFlight();
  expect(await abandoned).toBeUndefined();
  expect(firstWorker.terminated()).toBe(1);

  const restored = client.highlight(input);
  expect(replacementWorker.sent[0]).toMatchObject({ reset: true, source: input.source });
  replacementWorker.reply(replacementWorker.sent[0].id);
  expect(await restored).toEqual(spans);
  expect(creations).toBe(2);
  client.dispose();
});

test("falls back to native highlighting after a stalled worker", async () => {
  const fake = fakeWorker();
  const client = new HighlightsWorkerClient(() => fake.worker, 10);
  expect(await client.highlight(input)).toEqual([]);
  expect(fake.terminated()).toBe(1);
  expect(await client.highlight(input)).toEqual([]);
});

for (const failure of ["onerror", "onmessageerror"] as const) {
  test(`falls back after worker ${failure}`, async () => {
    const fake = fakeWorker();
    const client = new HighlightsWorkerClient(() => fake.worker);
    const first = client.highlight(input);
    fake.worker[failure]?.({ preventDefault() {} } as ErrorEvent & MessageEvent);
    expect(await first).toEqual([]);
    expect(await client.highlight(input)).toEqual([]);
    expect(fake.terminated()).toBe(1);
  });
}
