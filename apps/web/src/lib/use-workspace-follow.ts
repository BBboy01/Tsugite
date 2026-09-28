import { useCallback, useEffect, useMemo } from "react";

import type { PresenceMember } from "@iris/shared";

import { findFollowedMember, getFollowedSelection } from "./workspace-follow";

type WorkspaceFollowOptions = {
  currentUserId: string;
  members: readonly PresenceMember[];
  followingUserId: string | null;
  selectedPath: string;
  setFollowingUserId: (userId: string | null) => void;
  selectFile: (path: string) => void;
};

export function useWorkspaceFollow({
  currentUserId,
  members,
  followingUserId,
  selectedPath,
  setFollowingUserId,
  selectFile,
}: WorkspaceFollowOptions) {
  const followingMember = useMemo(
    () => findFollowedMember(members, followingUserId),
    [members, followingUserId],
  );
  const followedSelection = useMemo(
    () => getFollowedSelection(followingMember, selectedPath),
    [followingMember, selectedPath],
  );

  useEffect(() => {
    if (!followingUserId) return;
    if (!followingMember) {
      setFollowingUserId(null);
      return;
    }
    if (
      followingMember.selectedPath !== undefined &&
      followingMember.selectedPath !== selectedPath
    ) {
      selectFile(followingMember.selectedPath ?? "");
    }
  }, [followingMember, followingUserId, selectFile, selectedPath, setFollowingUserId]);

  const handleFollowMember = useCallback(
    (userId: string) => {
      if (userId === currentUserId) return;
      if (followingUserId === userId) {
        setFollowingUserId(null);
        return;
      }
      const member = findFollowedMember(members, userId);
      if (!member) return;
      setFollowingUserId(userId);
      if (member.selectedPath !== undefined) selectFile(member.selectedPath ?? "");
    },
    [currentUserId, followingUserId, members, selectFile, setFollowingUserId],
  );

  return { followedSelection, handleFollowMember };
}
