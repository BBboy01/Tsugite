import { faker } from "@faker-js/faker";
import type {
  PresenceListMessage,
  PresenceMember,
  PresenceMessage,
  PresenceRemovedMessage,
} from "@iris/shared";

export type RoomIdentity = {
  userId: string;
  displayName: string;
  color: string;
};

export const AVATAR_COLORS = ["#d88961", "#7389b7", "#5d9f8c", "#bc76a5"] as const;

const IDENTITY_STORAGE_KEY = "iris.identity.v1";

export class RoomPresence {
  private readonly listeners = new Set<(members: PresenceMember[]) => void>();
  private membersValue: PresenceMember[] = [];
  private selectedPath: string | undefined;
  private cursor: { anchor: number; head: number } | null | undefined;

  constructor(
    readonly identity: RoomIdentity,
    private readonly sendMessage: (message: PresenceMessage) => void,
    private readonly onIdentityChange: () => void = () => {},
  ) {}

  get members(): PresenceMember[] {
    return this.membersValue;
  }

  get hasLocalState(): boolean {
    return this.selectedPath !== undefined || this.cursor !== undefined;
  }

  send(selectedPath?: string, cursor?: { anchor: number; head: number } | null): void {
    if (selectedPath !== undefined) {
      this.selectedPath = selectedPath;
      if (cursor === undefined) this.cursor = null;
    }
    if (cursor !== undefined) this.cursor = cursor;
    this.sendMessage({
      type: "presence",
      ...this.identity,
      selectedPath: this.selectedPath,
      cursor: this.cursor,
    });
  }

  updateDisplayName(value: string): boolean {
    const displayName = value.trim();
    if (!displayName || displayName.length > 32 || displayName === this.identity.displayName) {
      return false;
    }
    this.identity.displayName = displayName;
    persistIdentity(this.identity);
    this.membersValue = this.membersValue.map((member) =>
      member.userId === this.identity.userId ? { ...member, displayName } : member,
    );
    this.emit();
    this.onIdentityChange();
    this.send();
    return true;
  }

  updateColor(value: string): boolean {
    const color = value.toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(color) || color === this.identity.color) return false;
    this.identity.color = color;
    persistIdentity(this.identity);
    this.membersValue = this.membersValue.map((member) =>
      member.userId === this.identity.userId ? { ...member, color } : member,
    );
    this.emit();
    this.onIdentityChange();
    this.send();
    return true;
  }

  receiveList(message: PresenceListMessage): void {
    const previousById = new Map(this.membersValue.map((member) => [member.userId, member]));
    this.membersValue = message.members.map((member) =>
      mergePresenceMember(previousById.get(member.userId), member),
    );
    this.emit();
  }

  receive(member: PresenceMessage): void {
    const previous = this.membersValue.find((item) => item.userId === member.userId);
    const nextMember = mergePresenceMember(previous, member);
    this.membersValue = [
      ...this.membersValue.filter((item) => item.userId !== nextMember.userId),
      nextMember,
    ];
    this.emit();
  }

  remove(message: PresenceRemovedMessage): void {
    this.membersValue = this.membersValue.filter((item) => item.userId !== message.userId);
    this.emit();
  }

  subscribe(listener: (members: PresenceMember[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.membersValue);
  }
}

export function getIdentity(): RoomIdentity {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem(IDENTITY_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as RoomIdentity;
        if (parsed.userId && parsed.displayName && parsed.color) return parsed;
      } catch {
        window.localStorage.removeItem(IDENTITY_STORAGE_KEY);
      }
    }
  }
  const identity = createGuestIdentity();
  persistIdentity(identity);
  return identity;
}

export function createGuestIdentity(): RoomIdentity {
  const userId = crypto.randomUUID();
  return {
    userId,
    displayName: faker.internet.username(),
    color: AVATAR_COLORS[userId.charCodeAt(0) % AVATAR_COLORS.length],
  };
}

function persistIdentity(identity: RoomIdentity): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(identity));
  }
}

function mergePresenceMember(
  previous: PresenceMember | undefined,
  incoming: PresenceMember,
): PresenceMember {
  return {
    ...previous,
    ...incoming,
    selectedPath:
      "selectedPath" in incoming ? (incoming.selectedPath ?? undefined) : previous?.selectedPath,
    cursor: "cursor" in incoming ? incoming.cursor : previous?.cursor,
  };
}
