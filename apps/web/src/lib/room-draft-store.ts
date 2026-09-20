export type RoomDraft = {
  version: 1;
  id: string;
  scope: string;
  updatedAt: number;
  snapshot: Uint8Array;
  updates: Uint8Array[];
};

export interface RoomDraftStore {
  list(scope: string): Promise<RoomDraft[]>;
  get(id: string): Promise<RoomDraft | undefined>;
  put(draft: RoomDraft): Promise<void>;
  remove(id: string): Promise<void>;
  lock(id: string): Promise<(() => void) | undefined>;
}

export function isRoomDraft(value: unknown): value is RoomDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<RoomDraft>;
  return (
    draft.version === 1 &&
    typeof draft.id === "string" &&
    typeof draft.scope === "string" &&
    typeof draft.updatedAt === "number" &&
    Number.isFinite(draft.updatedAt) &&
    draft.snapshot instanceof Uint8Array &&
    Array.isArray(draft.updates) &&
    draft.updates.length > 0 &&
    draft.updates.every((update) => update instanceof Uint8Array && update.length > 0)
  );
}

let database: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  if (!database) {
    database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("tsugite-drafts", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("drafts", { keyPath: "id" }).createIndex("scope", "scope");
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Draft database upgrade blocked"));
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          database = undefined;
        };
        resolve(db);
      };
    }).catch((error) => {
      database = undefined;
      throw error;
    });
  }
  return database;
}

async function transaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drafts", mode, { durability: "strict" });
    const request = run(tx.objectStore("drafts"));
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error ?? new Error("Draft transaction aborted"));
    tx.onerror = () => reject(tx.error ?? request.error);
  });
}

export const browserDraftStore: RoomDraftStore = {
  list: (scope) => transaction("readonly", (store) => store.index("scope").getAll(scope)),
  get: (id) => transaction("readonly", (store) => store.get(id)),
  put: async (draft) => {
    await transaction("readwrite", (store) => store.put(draft));
  },
  remove: async (id) => {
    await transaction("readwrite", (store) => store.delete(id));
  },
  lock: (id) =>
    new Promise((resolve, reject) => {
      if (!navigator.locks) {
        reject(new Error("Draft locking unavailable"));
        return;
      }
      void navigator.locks
        .request(`tsugite-draft:${id}`, { ifAvailable: true }, async (lock) => {
          if (!lock) {
            resolve(undefined);
            return;
          }
          await new Promise<void>((release) => resolve(release));
        })
        .catch(reject);
    }),
};
