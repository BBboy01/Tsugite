import { MAX_ROOM_UPDATE_BYTES } from "@iris/shared";

export const ROOM_LIMITS = {
  maxUpdateBytes: MAX_ROOM_UPDATE_BYTES,
  maxRooms: 128,
  maxClients: 256,
  maxMembers: 64,
  roomCreationLimit: 20,
  roomCreationWindowMs: 60_000,
};

export class WindowRateLimit {
  private count = 0;
  private startedAt: number;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now = Date.now,
  ) {
    this.startedAt = now();
  }

  consume(): boolean {
    const now = this.now();
    if (now - this.startedAt >= this.windowMs) {
      this.count = 0;
      this.startedAt = now;
    }
    if (this.count >= this.limit) return false;
    this.count++;
    return true;
  }
}
