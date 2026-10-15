import type { IntelligenceWorker } from "./typescript-worker-client";
import type { WorkerRequest } from "./typescript-worker-protocol";

export function transport() {
  const sent: WorkerRequest[] = [];
  let stopped = 0;
  const worker: IntelligenceWorker = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage: (request) => sent.push(request),
    terminate: () => stopped++,
  };
  return {
    worker,
    sent,
    stopped: () => stopped,
    reply: (request: WorkerRequest, result: unknown, sourceSnapshots?: Record<string, string>) =>
      worker.onmessage?.({
        data: {
          epoch: request.epoch,
          requestId: request.requestId,
          workspaceVersion: request.workspaceVersion,
          result,
          ...(sourceSnapshots ? { sourceSnapshots } : {}),
        },
      } as MessageEvent),
    crash: () => worker.onerror?.({ preventDefault() {} } as ErrorEvent),
  };
}

export const files = [{ path: "app.ts", text: "const value = 1; value;" }];
