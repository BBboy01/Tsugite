import type { PresenceMember } from "@iris/shared";

export function getFollowedSelection(member: PresenceMember | undefined, selectedPath: string) {
  return member?.selectedPath === selectedPath ? (member.cursor ?? null) : null;
}

export function findFollowedMember(
  members: readonly PresenceMember[],
  userId: string | null,
): PresenceMember | undefined {
  return userId ? members.find((member) => member.userId === userId) : undefined;
}
