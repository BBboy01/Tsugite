export const MAX_ROOM_UPDATE_BYTES = 1024 * 1024;

export type JoinMessage = {
  type: "join";
  userId: string;
  displayName: string;
  color: string;
};

export type PresenceMember = {
  userId: string;
  displayName: string;
  color: string;
  selectedPath?: string | null;
  cursor?: { anchor: number; head: number } | null;
};

export type PresenceMessage = PresenceMember & {
  type: "presence";
};

export type PresenceListMessage = {
  type: "presence:list";
  members: PresenceMember[];
};

export type PresenceRemovedMessage = {
  type: "presence:removed";
  userId: string;
};

export type ServerReadyMessage = {
  type: "ready";
  roomId: string;
};

export type UpdateAckMessage = {
  type: "update:ack";
};

export type ClientJsonMessage = JoinMessage | PresenceMessage;
export type ServerJsonMessage =
  | PresenceListMessage
  | PresenceRemovedMessage
  | PresenceMessage
  | UpdateAckMessage
  | ServerReadyMessage;

export function encodeJsonMessage(message: ClientJsonMessage | ServerJsonMessage): string {
  return JSON.stringify(message);
}

export function decodeJsonMessage(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function decodeServerJsonMessage(value: string): ServerJsonMessage | undefined {
  const message = decodeJsonMessage(value);
  return isServerJsonMessage(message) ? message : undefined;
}

export function isPresenceMessage(value: unknown): value is PresenceMessage {
  return isRecord(value) && value.type === "presence" && isPresenceMember(value);
}

function isServerJsonMessage(value: unknown): value is ServerJsonMessage {
  if (!isRecord(value) || typeof value.type !== "string") return false;

  switch (value.type) {
    case "ready":
      return typeof value.roomId === "string";
    case "update:ack":
      return true;
    case "presence":
      return isPresenceMessage(value);
    case "presence:list":
      return Array.isArray(value.members) && value.members.every(isPresenceMember);
    case "presence:removed":
      return typeof value.userId === "string";
    default:
      return false;
  }
}

function isPresenceMember(value: unknown): value is PresenceMember {
  if (
    !isRecord(value) ||
    typeof value.userId !== "string" ||
    typeof value.displayName !== "string" ||
    typeof value.color !== "string"
  ) {
    return false;
  }

  if (
    "selectedPath" in value &&
    value.selectedPath !== null &&
    typeof value.selectedPath !== "string"
  ) {
    return false;
  }

  return !("cursor" in value) || value.cursor === null || isCursor(value.cursor);
}

function isCursor(value: unknown): value is { anchor: number; head: number } {
  return (
    isRecord(value) &&
    typeof value.anchor === "number" &&
    Number.isFinite(value.anchor) &&
    typeof value.head === "number" &&
    Number.isFinite(value.head)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
