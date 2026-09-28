import { describe, expect, it } from "bun:test";

import { findFollowedMember, getFollowedSelection } from "./workspace-follow";

const member = {
  userId: "peer",
  displayName: "Peer",
  color: "#123456",
  selectedPath: "src/App.tsx",
  cursor: { anchor: 12, head: 12 },
};

describe("workspace follow projection", () => {
  it("selects only the requested remote member", () => {
    expect(findFollowedMember([member], "peer")).toBe(member);
    expect(findFollowedMember([member], null)).toBeUndefined();
    expect(findFollowedMember([member], "missing")).toBeUndefined();
  });

  it("exposes a remote cursor only when its file is active locally", () => {
    expect(getFollowedSelection(member, "src/App.tsx")).toEqual({ anchor: 12, head: 12 });
    expect(getFollowedSelection(member, "src/other.tsx")).toBeNull();
    expect(getFollowedSelection(undefined, "src/App.tsx")).toBeNull();
  });
});
