import { useEffect, useMemo, useRef, useState } from "react";

import { readSettings, readWorkspaceSnapshot } from "@iris/shared";

import { RoomClient, getIdentity } from "./room-client";

export function useRoomSession(roomId: string) {
  const [client] = useState(() => new RoomClient({ roomId, identity: getIdentity() }));
  const [workspaceRevision, setWorkspaceRevision] = useState(0);
  const [settingsRevision, setSettingsRevision] = useState(0);
  const [presenceRevision, setPresenceRevision] = useState(0);
  const [hasPendingChanges, setHasPendingChanges] = useState(client.hasPendingChanges);
  const disconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (disconnectTimer.current) {
      clearTimeout(disconnectTimer.current);
      disconnectTimer.current = null;
    }
    const preventPendingUnload = (event: BeforeUnloadEvent) => {
      if (!client.hasPendingChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const updatePendingChanges = () => {
      setHasPendingChanges(client.hasPendingChanges);
      if (client.hasPendingChanges) window.addEventListener("beforeunload", preventPendingUnload);
      else window.removeEventListener("beforeunload", preventPendingUnload);
    };
    updatePendingChanges();
    const unsubscribe = client.subscribe((event) => {
      if (event.type === "document") {
        if (event.changes.workspace) setWorkspaceRevision((value) => value + 1);
        if (event.changes.settings) setSettingsRevision((value) => value + 1);
      } else if (event.type === "sync") {
        updatePendingChanges();
      } else if (event.type !== "outbox" && event.type !== "snapshot") {
        setPresenceRevision((value) => value + 1);
      }
    });
    client.connect();
    return () => {
      unsubscribe();
      window.removeEventListener("beforeunload", preventPendingUnload);
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
  return { client, files, folders, settings, presenceRevision, hasPendingChanges };
}
