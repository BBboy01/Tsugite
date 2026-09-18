import { useEffect, useMemo, useRef, useState } from "react";

import { readSettings, readWorkspaceSnapshot } from "@iris/shared";

import { RoomClient, getIdentity } from "./room-client";

export function useRoomSession(roomId: string) {
  const [client] = useState(() => new RoomClient({ roomId, identity: getIdentity() }));
  const [workspaceRevision, setWorkspaceRevision] = useState(0);
  const [settingsRevision, setSettingsRevision] = useState(0);
  const [presenceRevision, setPresenceRevision] = useState(0);
  const disconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (disconnectTimer.current) {
      clearTimeout(disconnectTimer.current);
      disconnectTimer.current = null;
    }
    const unsubscribe = client.subscribe((event) => {
      if (event.type === "document") {
        if (event.changes.workspace) setWorkspaceRevision((value) => value + 1);
        if (event.changes.settings) setSettingsRevision((value) => value + 1);
      } else {
        setPresenceRevision((value) => value + 1);
      }
    });
    client.connect();
    return () => {
      unsubscribe();
      disconnectTimer.current = setTimeout(() => {
        client.disconnect();
        disconnectTimer.current = null;
      }, 0);
    };
  }, [client]);

  const { files, folders } = useMemo(
    () => readWorkspaceSnapshot(client.doc),
    [client, workspaceRevision],
  );
  const settings = useMemo(() => readSettings(client.doc), [client, settingsRevision]);
  return { client, files, folders, settings, presenceRevision };
}
