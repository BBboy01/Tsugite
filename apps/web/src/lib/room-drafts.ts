import type { RoomClient } from "./room-client";
import { isRoomDraft, type RoomDraft, type RoomDraftStore } from "./room-draft-store";

export type DraftState = {
  backup: "idle" | "saving" | "saved" | "error";
  available: RoomDraft[];
  error?: "storage" | "recovery";
  busy: boolean;
  applied: boolean;
};

const CHECKPOINT_DELAY = 250;

export class RoomDrafts {
  state: DraftState = { backup: "idle", available: [], busy: false, applied: false };
  private readonly id = crypto.randomUUID();
  private readonly releases = new Map<string, () => void>();
  private readonly listeners = new Set<() => void>();
  private starting?: Promise<void>;
  private writing?: Promise<boolean>;
  private timer?: ReturnType<typeof setTimeout>;
  private unsubscribe?: () => void;
  private ready = false;
  private disposed = false;
  private dirty = false;
  private restored = new Set<string>();

  constructor(
    private readonly client: RoomClient,
    private readonly scope: string,
    private readonly store: RoomDraftStore,
  ) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): Promise<void> {
    return (this.starting ??= this.initialize());
  }

  private async initialize(): Promise<void> {
    this.unsubscribe = this.client.subscribe((event) => {
      if (event.type === "outbox") this.schedule();
      if (event.type === "snapshot") void this.pruneConfirmed();
    });
    try {
      const release = await this.store.lock(this.id);
      if (!release) throw new Error("Draft is already owned");
      this.releases.set(this.id, release);
      const available: RoomDraft[] = [];
      for (const candidate of await this.store.list(this.scope)) {
        if (candidate.id === this.id) continue;
        const unlock = await this.store.lock(candidate.id);
        if (!unlock) continue;
        this.releases.set(candidate.id, unlock);
        // Re-read after claiming: the previous owner may have acknowledged and deleted it.
        const current = await this.store.get(candidate.id);
        if (!current || current.scope !== this.scope) {
          unlock();
          this.releases.delete(candidate.id);
          continue;
        }
        available.push(current);
      }
      this.ready = true;
      this.setState({ available: available.toSorted((a, b) => b.updatedAt - a.updatedAt) });
      await this.pruneConfirmed();
      if (this.client.hasPendingChanges) this.schedule();
    } catch {
      this.setState({ backup: "error", error: "storage" });
    }
  }

  private schedule(): void {
    if (this.disposed) return;
    this.dirty = true;
    if (this.ready) this.setState({ backup: "saving" });
    if (this.ready && !this.client.hasPendingChanges) {
      void this.flush();
      return;
    }
    if (this.timer || !this.ready) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, CHECKPOINT_DELAY);
  }

  async flush(): Promise<boolean> {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.ready) return false;
    if (this.writing) return this.writing;
    this.writing = this.checkpoint();
    try {
      return await this.writing;
    } finally {
      this.writing = undefined;
    }
  }

  private async checkpoint(): Promise<boolean> {
    try {
      while (this.dirty) {
        this.dirty = false;
        const updates = [...this.client.pendingUpdates];
        if (updates.length) {
          await this.store.put({
            version: 1,
            id: this.id,
            scope: this.scope,
            updatedAt: Date.now(),
            snapshot: this.client.doc.export({ mode: "snapshot" }),
            updates,
          });
        } else await this.store.remove(this.id);
      }
      this.setState({ backup: this.client.hasPendingChanges ? "saved" : "idle", error: undefined });
      return true;
    } catch {
      this.dirty = true;
      this.setState({ backup: "error", error: "storage" });
      return false;
    }
  }

  async restore(): Promise<void> {
    const draft = this.state.available[0];
    if (!draft || this.state.busy) return;
    this.setState({ busy: true, error: undefined });
    try {
      if (!isRoomDraft(draft)) throw new Error("Invalid draft");
      if (!this.restored.has(draft.id)) {
        this.client.restorePendingDraft(draft.snapshot, draft.updates);
        this.restored.add(draft.id);
        this.setState({ applied: true });
      }
      if (!(await this.flush())) return;
      await this.removeCandidate(draft.id);
    } catch {
      this.setState({ error: "recovery" });
    } finally {
      this.setState({ busy: false });
    }
  }

  private async pruneConfirmed(): Promise<void> {
    if (this.state.busy || this.disposed) return;
    for (const draft of this.state.available) {
      if (this.restored.has(draft.id)) continue;
      try {
        if (isRoomDraft(draft) && this.client.containsDraft(draft.snapshot, draft.updates)) {
          await this.removeCandidate(draft.id);
        }
      } catch {
        // A damaged record stays available for explicit recovery or discard.
      }
    }
  }

  async discard(): Promise<void> {
    const draft = this.state.available[0];
    if (!draft || this.state.busy || this.restored.has(draft.id)) return;
    this.setState({ busy: true, error: undefined });
    try {
      await this.removeCandidate(draft.id);
    } catch {
      this.setState({ error: "storage" });
    } finally {
      this.setState({ busy: false });
    }
  }

  private async removeCandidate(id: string): Promise<void> {
    await this.store.remove(id);
    this.releases.get(id)?.();
    this.releases.delete(id);
    this.restored.delete(id);
    const available = this.state.available.filter((draft) => draft.id !== id);
    this.setState({
      available,
      applied: Boolean(available[0] && this.restored.has(available[0].id)),
    });
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.unsubscribe?.();
    await this.starting;
    await this.flush();
    for (const release of this.releases.values()) release();
    this.releases.clear();
  }

  private setState(state: Partial<DraftState>): void {
    if (
      Object.entries(state).every(([key, value]) =>
        Object.is(this.state[key as keyof DraftState], value),
      )
    )
      return;
    this.state = { ...this.state, ...state };
    for (const listener of this.listeners) listener();
  }
}
