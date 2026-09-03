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

export type ClientJsonMessage = JoinMessage | PresenceMessage;
export type ServerJsonMessage =
  | PresenceListMessage
  | PresenceRemovedMessage
  | PresenceMessage
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

export function isPresenceMessage(value: unknown): value is PresenceMessage {
  return Boolean(
    value &&
    typeof value === "object" &&
    "type" in value &&
    value.type === "presence" &&
    "userId" in value &&
    typeof value.userId === "string",
  );
}
