import { useEffect, useMemo, useRef } from "react";
import { UndoManager } from "loro-crdt";
import type { LoroDoc } from "loro-crdt";

export const WORKSPACE_CHANGE_ORIGIN = "workspace";

type UndoManagerCache = {
  doc: LoroDoc;
  managers: Map<string, UndoManager>;
};

type PendingCleanup = {
  cache: UndoManagerCache;
  timer: ReturnType<typeof setTimeout>;
};

export function useEditorUndoManager(doc: LoroDoc, fileId: string): UndoManager {
  const cache = useMemo<UndoManagerCache>(() => ({ doc, managers: new Map() }), [doc]);
  const undoManager = useMemo(() => {
    const existing = cache.managers.get(fileId);
    if (existing) return existing;

    const created = new UndoManager(doc, {
      excludeOriginPrefixes: [WORKSPACE_CHANGE_ORIGIN],
    });
    cache.managers.set(fileId, created);
    return created;
  }, [cache, doc, fileId]);
  const cleanupRef = useRef<PendingCleanup | undefined>(undefined);

  useEffect(() => {
    if (cleanupRef.current?.cache === cache) {
      clearTimeout(cleanupRef.current.timer);
      cleanupRef.current = undefined;
    }

    return () => {
      const timer = setTimeout(() => {
        for (const manager of cache.managers.values()) manager.free();
        cache.managers.clear();
        if (cleanupRef.current?.cache === cache) cleanupRef.current = undefined;
      }, 0);
      cleanupRef.current = { cache, timer };
    };
  }, [cache]);

  return undoManager;
}
