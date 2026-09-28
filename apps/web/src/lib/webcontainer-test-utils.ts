import type { ProjectFile } from "@iris/shared";

import type { RuntimeContainer, RuntimeProcess } from "./webcontainer-runtime";

export function projectFile(path: string, contents: string): ProjectFile {
  return {
    id: path,
    path,
    language: "javascript",
    kind: "file",
    text: { toString: () => contents } as ProjectFile["text"],
  };
}

export function fakeProcess(exitCode = 0): RuntimeProcess {
  return {
    output: new ReadableStream({
      start(controller) {
        controller.close();
      },
    }),
    exit: Promise.resolve(exitCode),
    kill() {},
  };
}

export function fakeContainer(readyUrl = "http://localhost:4173") {
  const events = new Map<string, unknown>();
  const calls = {
    mount: [] as unknown[],
    spawn: [] as string[][],
    writes: [] as string[],
    removes: [] as string[],
    teardown: 0,
  };
  const container: RuntimeContainer = {
    fs: {
      async mkdir() {
        return "";
      },
      async writeFile(path, contents) {
        calls.writes.push(`${path}:${contents}`);
      },
      async rm(path) {
        calls.removes.push(path);
      },
    },
    async mount(tree) {
      calls.mount.push(tree);
    },
    async spawn(command, args) {
      calls.spawn.push([command, ...args]);
      if (args[0] === "run") {
        queueMicrotask(() =>
          (events.get("server-ready") as ((port: number, url: string) => void) | undefined)?.(
            4173,
            readyUrl,
          ),
        );
        const exit = Promise.withResolvers<number>();
        return { ...fakeProcess(), exit: exit.promise, kill: () => exit.resolve(143) };
      }
      return fakeProcess();
    },
    on(event, listener) {
      events.set(event, listener);
      return () => events.delete(event);
    },
    teardown() {
      calls.teardown += 1;
    },
  };
  return {
    container,
    calls,
    emitReady() {
      (events.get("server-ready") as ((port: number, url: string) => void) | undefined)?.(
        4173,
        readyUrl,
      );
    },
    emitError(error: Error) {
      (events.get("error") as ((error: Error) => void) | undefined)?.(error);
    },
  };
}
