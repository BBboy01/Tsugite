import { expect, test } from "bun:test";

import { EditorTabSession } from "./editor-tab-session";

const key = (roomId: string) => `iris.editor-tabs.v1.${roomId}`;
const files = [
  { id: "app", path: "src/App.tsx" },
  { id: "main", path: "src/main.tsx" },
  { id: "styles", path: "src/index.css" },
];
const initial = { openTabPaths: ["src/App.tsx"], selectedPath: "src/App.tsx" };

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => values.set(name, value),
  };
}

function save(
  storage: ReturnType<typeof memoryStorage>,
  roomId: string,
  fileIds: string[],
  activeFileId: string | null,
) {
  storage.setItem(key(roomId), JSON.stringify({ fileIds, activeFileId }));
}

test("keeps the room's saved tabs untouched until its first snapshot arrives", () => {
  const storage = memoryStorage();
  save(storage, "room", ["main", "app"], "main");
  const session = new EditorTabSession("room", storage);

  expect(session.synchronize({ ...initial, files: [], hasReceivedSnapshot: false })).toBeNull();
  expect(session.synchronize({ ...initial, files, hasReceivedSnapshot: false })).toBeNull();
  expect(JSON.parse(storage.getItem(key("room"))!)).toEqual({
    fileIds: ["main", "app"],
    activeFileId: "main",
  });
  expect(session.synchronize({ ...initial, files, hasReceivedSnapshot: true })).toEqual({
    openTabPaths: ["src/main.tsx", "src/App.tsx"],
    selectedPath: "src/main.tsx",
  });
});

test("restores the saved order and active file by stable IDs after a rename", () => {
  const storage = memoryStorage();
  save(storage, "room", ["main", "app"], "main");
  const session = new EditorTabSession("room", storage);
  const renamedFiles = [{ id: "main", path: "src/renamed.tsx" }, files[0]!];

  expect(
    session.synchronize({ ...initial, files: renamedFiles, hasReceivedSnapshot: true }),
  ).toEqual({
    openTabPaths: ["src/renamed.tsx", "src/App.tsx"],
    selectedPath: "src/renamed.tsx",
  });
});

test("does not write stale defaults when the restore effect repeats before its update is rendered", () => {
  const storage = memoryStorage();
  save(storage, "room", ["main", "app"], "main");
  const session = new EditorTabSession("room", storage);
  const restored = { openTabPaths: ["src/main.tsx", "src/App.tsx"], selectedPath: "src/main.tsx" };

  expect(session.synchronize({ ...initial, files, hasReceivedSnapshot: true })).toEqual(restored);
  expect(session.synchronize({ ...initial, files, hasReceivedSnapshot: true })).toEqual(restored);
  expect(JSON.parse(storage.getItem(key("room"))!)).toEqual({
    fileIds: ["main", "app"],
    activeFileId: "main",
  });
  expect(session.synchronize({ ...restored, files, hasReceivedSnapshot: true })).toBeNull();
});

test("saves later local order and active changes as stable IDs", () => {
  const storage = memoryStorage();
  const session = new EditorTabSession("room", storage);
  session.synchronize({ ...initial, files, hasReceivedSnapshot: true });
  session.synchronize({
    files,
    hasReceivedSnapshot: true,
    openTabPaths: ["src/index.css", "src/App.tsx", "src/main.tsx"],
    selectedPath: "src/main.tsx",
  });

  expect(JSON.parse(storage.getItem(key("room"))!)).toEqual({
    fileIds: ["styles", "app", "main"],
    activeFileId: "main",
  });
});

test("filters deleted saved files and falls back to the first surviving tab", () => {
  const storage = memoryStorage();
  save(storage, "room", ["deleted", "styles", "main", "app"], "deleted");
  const session = new EditorTabSession("room", storage);

  expect(session.synchronize({ ...initial, files, hasReceivedSnapshot: true })).toEqual({
    openTabPaths: ["src/index.css", "src/main.tsx", "src/App.tsx"],
    selectedPath: "src/index.css",
  });
});

test("restores an empty editor when all saved files have been deleted", () => {
  const storage = memoryStorage();
  save(storage, "room", ["deleted"], "deleted");
  const session = new EditorTabSession("room", storage);

  expect(session.synchronize({ ...initial, files, hasReceivedSnapshot: true })).toEqual({
    openTabPaths: [],
    selectedPath: "",
  });
});

test("restores an explicitly saved empty session instead of opening the default file", () => {
  const storage = memoryStorage();
  save(storage, "room", [], null);
  const session = new EditorTabSession("room", storage);

  expect(session.synchronize({ ...initial, files, hasReceivedSnapshot: true })).toEqual({
    openTabPaths: [],
    selectedPath: "",
  });
});

test("preserves an explicitly empty active file while tabs remain open", () => {
  const storage = memoryStorage();
  save(storage, "room", ["main", "app"], null);
  const session = new EditorTabSession("room", storage);

  expect(session.synchronize({ ...initial, files, hasReceivedSnapshot: true })).toEqual({
    openTabPaths: ["src/main.tsx", "src/App.tsx"],
    selectedPath: "",
  });
});

test("keeps normal initial navigation when the room has no saved session", () => {
  const storage = memoryStorage();
  const session = new EditorTabSession("room", storage);

  expect(session.synchronize({ ...initial, files, hasReceivedSnapshot: true })).toBeNull();
  expect(JSON.parse(storage.getItem(key("room"))!)).toEqual({
    fileIds: ["app"],
    activeFileId: "app",
  });
});

test("treats an empty received room snapshot as a real deletion", () => {
  const storage = memoryStorage();
  const session = new EditorTabSession("room", storage);

  expect(session.synchronize({ ...initial, files: [], hasReceivedSnapshot: true })).toEqual({
    openTabPaths: [],
    selectedPath: "",
  });
  expect(storage.getItem(key("room"))).toBeNull();
  session.synchronize({ openTabPaths: [], selectedPath: "", files: [], hasReceivedSnapshot: true });
  expect(JSON.parse(storage.getItem(key("room"))!)).toEqual({ fileIds: [], activeFileId: null });
});

test("preserves a live rename in place and selects the first surviving tab after remote deletion", () => {
  const storage = memoryStorage();
  const session = new EditorTabSession("room", storage);
  const navigation = {
    openTabPaths: ["src/index.css", "src/main.tsx", "src/App.tsx"],
    selectedPath: "src/main.tsx",
  };
  session.synchronize({ ...navigation, files, hasReceivedSnapshot: true });
  const renamedFiles = [files[0]!, { id: "main", path: "src/renamed.tsx" }, files[2]!];
  const renamed = {
    ...navigation,
    openTabPaths: ["src/index.css", "src/renamed.tsx", "src/App.tsx"],
    selectedPath: "src/renamed.tsx",
  };

  expect(
    session.synchronize({ ...navigation, files: renamedFiles, hasReceivedSnapshot: true }),
  ).toEqual(renamed);
  session.synchronize({ ...renamed, files: renamedFiles, hasReceivedSnapshot: true });
  expect(
    session.synchronize({ ...renamed, files: [files[0]!, files[2]!], hasReceivedSnapshot: true }),
  ).toEqual({
    openTabPaths: ["src/index.css", "src/App.tsx"],
    selectedPath: "src/index.css",
  });
});

test("isolates saved sessions by room", () => {
  const storage = memoryStorage();
  save(storage, "first", ["main"], "main");
  new EditorTabSession("second", storage).synchronize({
    ...initial,
    files,
    hasReceivedSnapshot: true,
  });

  expect(
    new EditorTabSession("first", storage).synchronize({
      ...initial,
      files,
      hasReceivedSnapshot: true,
    }),
  ).toEqual({
    openTabPaths: ["src/main.tsx"],
    selectedPath: "src/main.tsx",
  });
});

for (const invalid of [
  "{",
  "null",
  "[]",
  '{"fileIds":[42],"activeFileId":null}',
  '{"fileIds":["main"]}',
  '{"fileIds":["main"],"activeFileId":42}',
]) {
  test(`falls back to normal navigation for a malformed session: ${invalid}`, () => {
    const storage = memoryStorage();
    storage.setItem(key("room"), invalid);

    expect(
      new EditorTabSession("room", storage).synchronize({
        ...initial,
        files,
        hasReceivedSnapshot: true,
      }),
    ).toBeNull();
    expect(storage.getItem(key("room"))).toBe('{"fileIds":["app"],"activeFileId":"app"}');
  });
}

test("deduplicates saved file IDs and falls back when the active ID was not opened", () => {
  const storage = memoryStorage();
  save(storage, "room", ["main", "main", "app"], "styles");

  expect(
    new EditorTabSession("room", storage).synchronize({
      ...initial,
      files,
      hasReceivedSnapshot: true,
    }),
  ).toEqual({
    openTabPaths: ["src/main.tsx", "src/App.tsx"],
    selectedPath: "src/main.tsx",
  });
});

test("continues navigating when local storage reads or writes fail", () => {
  const storage = {
    getItem: () => {
      throw new Error("read denied");
    },
    setItem: () => {
      throw new Error("quota exceeded");
    },
  };
  const session = new EditorTabSession("room", storage);

  expect(session.synchronize({ ...initial, files, hasReceivedSnapshot: true })).toBeNull();
  expect(session.synchronize({ ...initial, files: [], hasReceivedSnapshot: true })).toEqual({
    openTabPaths: [],
    selectedPath: "",
  });
});
