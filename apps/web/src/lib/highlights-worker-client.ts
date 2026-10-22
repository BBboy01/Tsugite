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
  scopeId: number;
  resolve: (value: HighlightSpan[] | undefined) => void;
};

type SessionContext = Pick<HighlightsInput, "source" | "language" | "theme">;

export class HighlightsWorkerClient {
  private worker: HighlightsWorker | undefined;
  private active: Pending | undefined;
  private pending: Pending | undefined;
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private requestId = 0;
  private disposed = false;
  private failed = false;
  private needsReset = true;
  private nextScopeId = 0;
  private activeScopeId = 0;
  private lastRequestScopeId = 0;
  private sessionContext: SessionContext | undefined;

  constructor(
    private readonly createWorker: () => HighlightsWorker = () =>
      new Worker(new URL("./highlights.worker.ts", import.meta.url), { type: "module" }),
    private readonly timeoutMs = 3000,
  ) {}

  createScope(): number {
    if (this.active) {
      this.stop();
      this.active.resolve(undefined);
      this.pending?.resolve(undefined);
      this.active = this.pending = undefined;
    }
    this.activeScopeId = ++this.nextScopeId;
    this.needsReset = true;
    return this.activeScopeId;
  }

  highlight(input: HighlightsInput, scopeId?: number): Promise<HighlightSpan[] | undefined> {
    if (this.disposed) return Promise.resolve(undefined);
    if (this.failed) return Promise.resolve([]);
    if (scopeId !== undefined && scopeId !== this.activeScopeId) return Promise.resolve(undefined);
    return new Promise((resolve) => {
      const isNewScope = scopeId !== undefined && scopeId !== this.lastRequestScopeId;
      const canReuseTokenizer =
        isNewScope &&
        Boolean(this.worker) &&
        this.sessionContext?.language === input.language &&
        this.sessionContext?.theme === input.theme;
      const reset =
        this.needsReset &&
        !canReuseTokenizer &&
        (!this.worker || !sameSessionContext(this.sessionContext, input));
      const sendSnapshot = reset || canReuseTokenizer;
      const request: HighlightsRequest = {
        id: ++this.requestId,
        reset,
        source: sendSnapshot ? input.source : undefined,
        edits: sendSnapshot ? [] : input.edits,
        language: input.language,
        theme: input.theme,
        viewport: input.viewport,
        lineOffsets: input.lineOffsets,
      };
      this.needsReset = false;
      if (scopeId !== undefined) this.lastRequestScopeId = scopeId;
      this.sessionContext = {
        source: input.source,
        language: input.language,
        theme: input.theme,
      };
      const next = { request, scopeId: scopeId ?? this.activeScopeId, resolve };
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

  cancelInFlight(scopeId?: number): void {
    if (scopeId !== undefined && scopeId !== this.activeScopeId) return;
    this.needsReset = true;
    if (scopeId !== undefined && this.active?.scopeId !== scopeId) {
      if (this.pending?.scopeId === scopeId) {
        this.pending.resolve(undefined);
        this.pending = undefined;
      }
      return;
    }
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
          const activeRequest = this.active.request;
          clearTimeout(this.timeout);
          this.timeout = undefined;
          this.active.resolve(this.pending ? undefined : data.spans);
          this.active = undefined;
          const pending = this.pending;
          this.pending = undefined;
          if (pending) {
            if (canReuseActiveSession(activeRequest, pending.request)) {
              pending.request.reset = false;
              pending.request.source = undefined;
              pending.request.edits = [];
            }
            this.send(pending);
          }
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

function canReuseActiveSession(active: HighlightsRequest, pending: HighlightsRequest): boolean {
  return (
    active.reset &&
    pending.reset &&
    active.source === pending.source &&
    active.language === pending.language &&
    active.theme === pending.theme
  );
}

function sameSessionContext(previous: SessionContext | undefined, next: SessionContext): boolean {
  return (
    previous?.source === next.source &&
    previous.language === next.language &&
    previous.theme === next.theme
  );
}
