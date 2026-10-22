import type {
  HighlightEdit,
  HighlightSpan,
  HighlightViewport,
  HighlightsLanguage,
} from "./highlights-engine";
import type { WorkspaceTheme } from "@iris/shared";

export type HighlightsRequest = {
  id: number;
  reset: boolean;
  source?: string;
  edits: readonly HighlightEdit[];
  language: HighlightsLanguage;
  theme: WorkspaceTheme;
  viewport: HighlightViewport;
  lineOffsets: readonly number[];
};

export type HighlightsReply = { id: number; spans: HighlightSpan[]; ready: boolean };

export type HighlightsWorker = {
  postMessage: (request: HighlightsRequest) => void;
  terminate: () => void;
  onmessage: ((event: MessageEvent<HighlightsReply>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
};

export type HighlightsInput = {
  source: string;
  edits: readonly HighlightEdit[];
  language: HighlightsLanguage;
  theme: WorkspaceTheme;
  viewport: HighlightViewport;
  lineOffsets: readonly number[];
};

type Pending = {
  request: HighlightsRequest;
  resolve: (value: HighlightSpan[] | undefined) => void;
};

export class HighlightsWorkerClient {
  private worker: HighlightsWorker | undefined;
  private active: Pending | undefined;
  private pending: Pending | undefined;
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private requestId = 0;
  private disposed = false;
  private failed = false;
  private needsReset = true;

  constructor(
    private readonly createWorker: () => HighlightsWorker = () =>
      new Worker(new URL("./highlights.worker.ts", import.meta.url), { type: "module" }),
    private readonly timeoutMs = 2000,
  ) {}

  highlight(input: HighlightsInput): Promise<HighlightSpan[] | undefined> {
    if (this.disposed) return Promise.resolve(undefined);
    if (this.failed) return Promise.resolve([]);
    return new Promise((resolve) => {
      const request: HighlightsRequest = {
        id: ++this.requestId,
        reset: this.needsReset,
        source: this.needsReset ? input.source : undefined,
        edits: this.needsReset ? [] : input.edits,
        language: input.language,
        theme: input.theme,
        viewport: input.viewport,
        lineOffsets: input.lineOffsets,
      };
      this.needsReset = false;
      const next = { request, resolve };
      if (this.active) {
        if (this.pending) {
          request.reset = true;
          request.source = input.source;
          request.edits = [];
        }
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
    this.needsReset = true;
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
    this.needsReset = true;
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
