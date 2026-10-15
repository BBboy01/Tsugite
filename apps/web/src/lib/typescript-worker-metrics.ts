export type TypeScriptWorkerStatus = Readonly<{
  state: "loading" | "ready" | "fallback" | "unavailable" | "disposed";
  reason?: string;
}>;

export type TypeScriptWorkerMetrics = Readonly<{
  workerStarts: number;
  workerRetries: number;
  readyCount: number;
  fallbackCount: number;
  unavailableCount: number;
}>;

export class TypeScriptWorkerLifecycle {
  private status: TypeScriptWorkerStatus = { state: "loading" };
  private listeners = new Set<() => void>();
  private metrics = {
    workerStarts: 0,
    workerRetries: 0,
    readyCount: 0,
    fallbackCount: 0,
    unavailableCount: 0,
  } satisfies TypeScriptWorkerMetrics;

  constructor(private readonly onMetrics?: (metrics: TypeScriptWorkerMetrics) => void) {}

  getStatusSnapshot = (): TypeScriptWorkerStatus => this.status;
  getMetricsSnapshot = (): TypeScriptWorkerMetrics => ({ ...this.metrics });

  subscribeStatus = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  start(retry: boolean): void {
    this.metrics.workerStarts++;
    if (retry) this.metrics.workerRetries++;
    if (!this.setStatus("loading")) this.reportMetrics();
  }

  setStatus(state: TypeScriptWorkerStatus["state"], reason?: string): boolean {
    if (this.status.state === state && this.status.reason === reason) return false;
    const changedState = this.status.state !== state;
    this.status = { state, reason };
    if (changedState)
      if (state === "ready") this.metrics.readyCount++;
      else if (state === "fallback") this.metrics.fallbackCount++;
      else if (state === "unavailable") this.metrics.unavailableCount++;
    this.reportMetrics();
    this.listeners.forEach((listener) => listener());
    return true;
  }

  clearListeners(): void {
    this.listeners.clear();
  }

  private reportMetrics(): void {
    try {
      this.onMetrics?.(this.getMetricsSnapshot());
    } catch {
      return;
    }
  }
}
