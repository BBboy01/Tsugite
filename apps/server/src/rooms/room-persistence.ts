type PendingSnapshot = {
  save: () => void;
  timer: ReturnType<typeof setTimeout> | undefined;
  reported: boolean;
};

export class RoomPersistence {
  private readonly pending = new Map<string, PendingSnapshot>();

  constructor(
    private readonly delayMs: number,
    private readonly onError: (roomId: string, error: unknown) => void,
  ) {}

  schedule(roomId: string, save: () => void): void {
    if (this.pending.has(roomId)) return;
    const entry: PendingSnapshot = { save, timer: undefined, reported: false };
    this.pending.set(roomId, entry);
    this.startTimer(roomId, entry);
  }

  flush(roomId: string): boolean {
    const entry = this.pending.get(roomId);
    if (!entry) return true;
    clearTimeout(entry.timer);
    try {
      entry.save();
      this.pending.delete(roomId);
      return true;
    } catch (error) {
      this.startTimer(roomId, entry);
      if (!entry.reported) {
        entry.reported = true;
        this.onError(roomId, error);
      }
      return false;
    }
  }

  flushAll(): boolean {
    let saved = true;
    for (const roomId of this.pending.keys()) {
      if (!this.flush(roomId)) saved = false;
    }
    return saved;
  }

  private startTimer(roomId: string, entry: PendingSnapshot): void {
    entry.timer = setTimeout(() => this.flush(roomId), this.delayMs);
    entry.timer.unref();
  }
}
