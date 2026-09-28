import type { PresenceMember } from "@iris/shared";
import type { ConnectionStatus } from "./room-transport";

export type RoomClientEvent =
  | { type: "outbox" }
  | { type: "snapshot" }
  | { type: "status"; status: ConnectionStatus }
  | { type: "sync"; pending: boolean }
  | { type: "document"; changes: { workspace: boolean; settings: boolean; content: boolean } }
  | { type: "presence"; members: PresenceMember[] };
