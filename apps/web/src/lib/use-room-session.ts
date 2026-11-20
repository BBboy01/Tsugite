import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { readSettings, readWorkspaceSnapshot } from "@iris/shared";

import { getIdentity } from "./room-client";
import { RoomSession } from "./room-session";

export function useRoomSession(roomId: string) {
  const [session] = useState(
    () =>
      new RoomSession({
        roomId,
        identity: getIdentity(),
      }),
  );
  const { client, typeScript } = session;
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

  useEffect(
    () =>
      session.mount((changes) => {
        if (changes.workspace) setWorkspaceRevision((value) => value + 1);
        if (changes.settings) setSettingsRevision((value) => value + 1);
      }),
    [session],
  );

  const { files, folders } = useMemo(
    () => readWorkspaceSnapshot(client.doc),
    [client, workspaceRevision],
  );
  const settings = useMemo(
    () => readSettings(client.doc),
    [client, settingsRevision],
  );
  return {
    client,
    typeScript,
    files,
    folders,
    settings,
    status,
    members,
    hasPendingChanges,
    hasReceivedSnapshot,
  };
}
