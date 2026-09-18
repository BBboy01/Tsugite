const WINDOW_MS = 250;
// At most 100 messages across five overlapping windows, below the server's 120/s limit.
const MESSAGES_PER_WINDOW = 20;

export class RoomOutbox {
  private readonly updates: Uint8Array[] = [];
  private presence: string | undefined;
  private send: ((data: string | Uint8Array) => void) | undefined;
  private inFlight = 0;
  private windowStart = 0;
  private sent = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  connect(send: (data: string | Uint8Array) => void): void {
    this.send = send;
    this.inFlight = 0;
    this.windowStart = Date.now();
    this.sent = 1; // The join message has already been sent.
    this.flush();
  }

  disconnect(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.send = undefined;
    this.inFlight = 0;
    this.presence = undefined;
  }

  update(bytes: Uint8Array): void {
    this.updates.push(bytes);
    this.flush();
  }

  updatePresence(message: string): void {
    this.presence = message;
    this.flush();
  }

  acknowledge(): void {
    if (this.inFlight === 0) return;
    this.updates.shift();
    this.inFlight--;
    this.flush();
  }

  private flush(): void {
    if (!this.send || this.timer !== undefined) return;
    while (this.send) {
      const update = this.updates[this.inFlight];
      const message = update ?? this.presence;
      if (message === undefined) return;
      const elapsed = Date.now() - this.windowStart;
      if (elapsed >= WINDOW_MS) {
        this.windowStart = Date.now();
        this.sent = 0;
      }
      if (this.sent >= MESSAGES_PER_WINDOW) {
        this.timer = setTimeout(
          () => {
            this.timer = undefined;
            this.flush();
          },
          Math.max(1, WINDOW_MS - elapsed),
        );
        return;
      }
      this.sent++;
      if (update) this.inFlight++;
      else this.presence = undefined;
      this.send(message);
    }
  }
}
