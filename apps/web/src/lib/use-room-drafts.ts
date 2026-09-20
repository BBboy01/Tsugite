import { useEffect, useRef, useState } from "react";
import type { RoomClient } from "./room-client";
import { browserDraftStore } from "./room-draft-store";
import { RoomDrafts } from "./room-drafts";

export function useRoomDrafts(client: RoomClient) {
  const [session] = useState(() => new RoomDrafts(client, client.draftScope, browserDraftStore));
  const [state, setState] = useState(session.state);
  const disposal = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(disposal.current);
    const unsubscribe = session.subscribe(() => setState(session.state));
    void session.start();
    return () => {
      unsubscribe();
      disposal.current = setTimeout(() => {
        void session.dispose();
      }, 0);
    };
  }, [session]);
  return { state, session };
}
