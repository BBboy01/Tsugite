import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { readSettings, readWorkspaceSnapshot } from "@iris/shared";

import { getIdentity, RoomClient } from "./room-client";

export function useRoomSession(roomId: string) {
  const [client] = useState(() => new RoomClient({ roomId, identity: getIdentity() }));
  const [workspaceRevision, setWorkspaceRevision] = useState(0);
  const [settingsRevision, setSettingsRevision] = useState(0);
  const status = useSyncExternalStore(
    client.subscribeStatus,
    client.getStatusSnapshot,
    client.getStatusSnapshot,
  );
  const members = useSyncExternalStore(
    client.subscribePresence,
    client.getMembersSnapshot,
    client.getMembersSnapshot,
  );
  const hasPendingChanges = useSyncExternalStore(
    client.subscribeSync,
    client.getPendingChangesSnapshot,
    client.getPendingChangesSnapshot,
  );
  const hasReceivedSnapshot = useSyncExternalStore(
    client.subscribeSnapshot,
    client.getSnapshotReceived,
    client.getSnapshotReceived,
  );
  const disconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const preventPendingUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const updateUnloadProtection = () => {
      if (client.hasPendingChanges) {
        window.addEventListener("beforeunload", preventPendingUnload);
      } else {
        window.removeEventListener("beforeunload", preventPendingUnload);
      }
    };
    updateUnloadProtection();
    const unsubscribe = client.subscribeSync(updateUnloadProtection);
    return () => {
      unsubscribe();
      window.removeEventListener("beforeunload", preventPendingUnload);
    };
  }, [client]);

  useEffect(() => {
    if (disconnectTimer.current) {
      clearTimeout(disconnectTimer.current);
      disconnectTimer.current = null;
    }
    const unsubscribe = client.subscribe((event) => {
      if (event.type === "document") {
        if (event.changes.workspace) setWorkspaceRevision((value) => value + 1);
        if (event.changes.settings) setSettingsRevision((value) => value + 1);
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
  return {
    client,
    files,
    folders,
    settings,
    status,
    members,
    hasPendingChanges,
    hasReceivedSnapshot,
  };
}
