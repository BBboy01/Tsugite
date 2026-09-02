import { t } from "elysia";

export const joinSchema = t.Object({
  type: t.Literal("join"),
  userId: t.String({ minLength: 1, maxLength: 80 }),
  displayName: t.String({ minLength: 1, maxLength: 32 }),
  color: t.String({ pattern: "^#[0-9a-fA-F]{6}$" }),
});

export const presenceSchema = t.Object({
  type: t.Literal("presence"),
  userId: t.String({ minLength: 1, maxLength: 80 }),
  displayName: t.String({ minLength: 1, maxLength: 32 }),
  color: t.String({ pattern: "^#[0-9a-fA-F]{6}$" }),
  selectedPath: t.Optional(t.String({ maxLength: 240 })),
  cursor: t.Optional(
    t.Object({
      anchor: t.Number({ minimum: 0 }),
      head: t.Number({ minimum: 0 }),
    }),
  ),
});

export type JoinPayload = typeof joinSchema.static;
export type PresencePayload = typeof presenceSchema.static;

export function isJoinPayload(value: unknown): value is JoinPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<JoinPayload>;
  return (
    candidate.type === "join" &&
    typeof candidate.userId === "string" &&
    candidate.userId.length > 0 &&
    candidate.userId.length <= 80 &&
    typeof candidate.displayName === "string" &&
    candidate.displayName.trim().length > 0 &&
    candidate.displayName.length <= 32 &&
    typeof candidate.color === "string" &&
    /^#[0-9a-fA-F]{6}$/.test(candidate.color)
  );
}

export function isPresencePayload(value: unknown): value is PresencePayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PresencePayload>;
  return (
    candidate.type === "presence" &&
    typeof candidate.userId === "string" &&
    typeof candidate.displayName === "string" &&
    typeof candidate.color === "string" &&
    /^#[0-9a-fA-F]{6}$/.test(candidate.color) &&
    (candidate.selectedPath === undefined || candidate.selectedPath.length <= 240) &&
    (candidate.cursor === undefined ||
      (Number.isFinite(candidate.cursor.anchor) &&
        Number.isFinite(candidate.cursor.head) &&
        candidate.cursor.anchor >= 0 &&
        candidate.cursor.head >= 0))
  );
}
