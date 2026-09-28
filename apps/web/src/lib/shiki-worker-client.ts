import type { HighlightInput, HighlightSpan } from "./shiki-engine";

export type HighlightRequest = HighlightInput & { id: number };
export type HighlightReply = { id: number; spans: HighlightSpan[] };
export type HighlightWorker = {
  postMessage: (request: HighlightRequest) => void;
  terminate: () => void;
  onmessage: ((event: MessageEvent<HighlightReply>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
};
type Pending = { request: HighlightRequest; resolve: (value: HighlightSpan[] | undefined) => void };

export class ShikiWorkerClient {
  private worker: HighlightWorker | undefined;
  private active: Pending | undefined;
  private pending: Pending | undefined;
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private requestId = 0;
  private disposed = false;
  private failed = false;

  constructor(
    private readonly createWorker: () => HighlightWorker = () =>
      new Worker(new URL("./shiki.worker.ts", import.meta.url), { type: "module" }),
    private readonly timeoutMs = 2000,
  ) {}

  highlight(input: HighlightInput): Promise<HighlightSpan[] | undefined> {
    if (this.disposed) return Promise.resolve(undefined);
    if (this.failed) return Promise.resolve([]);
    return new Promise((resolve) => {
      const next = { request: { ...input, id: ++this.requestId }, resolve };
      if (this.active) {
        this.pending?.resolve(undefined);
        this.pending = next;
      } else this.send(next);
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.active?.resolve(undefined);
    this.pending?.resolve(undefined);
    this.active = this.pending = undefined;
  }

  cancelInFlight(): void {
    if (!this.active && !this.pending) return;
    this.stop();
    this.active?.resolve(undefined);
    this.pending?.resolve(undefined);
    this.active = this.pending = undefined;
  }

  private send(next: Pending): void {
    this.active = next;
    try {
      if (!this.worker) {
        this.worker = this.createWorker();
        this.worker.onmessage = ({ data }) => {
          if (data.id !== this.active?.request.id) return;
          clearTimeout(this.timeout);
          this.timeout = undefined;
          this.active.resolve(this.pending ? undefined : data.spans);
          this.active = undefined;
          const pending = this.pending;
          this.pending = undefined;
          if (pending) this.send(pending);
        };
        this.worker.onerror = this.worker.onmessageerror = (event: Event) => {
          event.preventDefault();
          this.fail();
        };
      }
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- Dedicated workers do not accept targetOrigin.
      this.worker.postMessage(next.request);
      this.timeout = setTimeout(() => this.fail(), this.timeoutMs);
    } catch {
      this.fail();
    }
  }

  private fail(): void {
    this.failed = true;
    this.stop();
    this.active?.resolve([]);
    this.pending?.resolve([]);
    this.active = this.pending = undefined;
  }

  private stop(): void {
    clearTimeout(this.timeout);
    this.timeout = undefined;
    if (!this.worker) return;
    this.worker.onmessage = this.worker.onerror = this.worker.onmessageerror = null;
    this.worker.terminate();
    this.worker = undefined;
  }
}
