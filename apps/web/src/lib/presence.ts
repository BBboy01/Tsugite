import type { PresenceMember } from "@iris/shared";

export function isPresenceCurrentUser(memberId: string, currentUserId: string): boolean {
  return memberId === currentUserId;
}

export function getFileCollaboratorCount(
  members: readonly Pick<PresenceMember, "userId" | "selectedPath">[],
  currentUserId: string,
  selectedPath: string,
): number {
  return members.filter(
    (member) => member.userId !== currentUserId && member.selectedPath === selectedPath,
  ).length;
}

export function prioritizeCurrentUser<T extends { userId: string }>(
  members: readonly T[],
  currentUserId: string,
): T[] {
  const currentIndex = members.findIndex((member) =>
    isPresenceCurrentUser(member.userId, currentUserId),
  );
  if (currentIndex <= 0) return [...members];
  return [
    members[currentIndex],
    ...members.slice(0, currentIndex),
    ...members.slice(currentIndex + 1),
  ];
}
