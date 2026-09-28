import { expect, test } from "bun:test";

import { WebContainerRuntime, type RuntimeSettings } from "./webcontainer-runtime";
import { fakeContainer, projectFile } from "./webcontainer-test-utils";

const settings: RuntimeSettings = {
  packageManager: "pnpm",
  autoInstall: false,
  autoStartPreview: false,
};
const packageFile = projectFile("package.json", '{"scripts":{"dev":"vite"}}');
const project = (value: string) => [packageFile, projectFile("main.js", value)];

for (const latest of ["second edit", "original"]) {
  test(`a delayed earlier sync cannot overwrite ${latest}`, async () => {
    const fake = fakeContainer();
    const writing = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let actual = "original";
    fake.container.fs.writeFile = async (_path, contents) => {
      if (contents === "first edit") {
        writing.resolve();
        await release.promise;
      }
      actual = contents;
    };
    const runtime = new WebContainerRuntime({ boot: async () => fake.container });
    await runtime.start(project("original"), [], () => {}, settings);

    const first = runtime.sync(project("first edit"), []);
    await writing.promise;
    const second = runtime.sync(project(latest), []);
    release.resolve();
    await Promise.all([first, second]);

    expect(actual).toBe(latest);
    runtime.dispose();
  });
}

test("restarting waits for an in-flight mount before applying the new project", async () => {
  const fake = fakeContainer();
  const mounting = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let actual: string | Uint8Array | undefined;
  fake.container.mount = async (tree) => {
    const entry = tree["main.js"];
    if (!("file" in entry) || !("contents" in entry.file)) throw new Error("expected main.js");
    if (entry.file.contents === "original") {
      mounting.resolve();
      await release.promise;
    }
    actual = entry.file.contents;
  };
  const runtime = new WebContainerRuntime({ boot: async () => fake.container });
  const first = runtime.start(project("original"), [], () => {}, settings);
  await mounting.promise;
  const second = runtime.restart(project("replacement"), [], () => {}, settings);
  await Promise.resolve();
  release.resolve();
  await Promise.all([first, second]);

  expect(actual).toBe("replacement");
  runtime.dispose();
});

test("an old sync cannot write into a container created after disposal", async () => {
  const old = fakeContainer();
  const current = fakeContainer();
  const writing = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const writes: string[] = [];
  old.container.fs.writeFile = async (path) => {
    writing.resolve();
    await release.promise;
    writes.push(path);
  };
  let boots = 0;
  const runtime = new WebContainerRuntime({
    boot: async () => (++boots === 1 ? old.container : current.container),
  });
  await runtime.start(project("original"), [], () => {}, settings);
  const pending = runtime.sync([...project("edit"), projectFile("other.js", "obsolete")], []);
  await writing.promise;
  runtime.dispose();
  await runtime.start(project("current"), [], () => {}, settings);
  release.resolve();
  await pending;

  expect(writes).toEqual(["/main.js"]);
  expect(current.calls.writes).toEqual([]);
  await runtime.sync(project("current"), []);
  expect(current.calls.writes).toEqual([]);
  runtime.dispose();
});

test("sync after a partial write failure reconciles the files actually written", async () => {
  const fake = fakeContainer();
  const actual = new Map([
    ["/main.js", "original"],
    ["/other.js", "original"],
  ]);
  fake.container.fs.writeFile = async (path, contents) => {
    if (path === "/other.js" && contents === "broken") throw new Error("disk write failed");
    actual.set(path, contents);
  };
  const runtime = new WebContainerRuntime({ boot: async () => fake.container });
  const original = [...project("original"), projectFile("other.js", "original")];
  await runtime.start(original, [], () => {}, settings);
  await expect(
    runtime.sync([...project("changed"), projectFile("other.js", "broken")], []),
  ).rejects.toThrow("disk write failed");
  await runtime.sync(original, []);

  expect(actual.get("/main.js")).toBe("original");
  expect(actual.get("/other.js")).toBe("original");
  runtime.dispose();
});

test("syncs only changed files without reading the rest of the project", async () => {
  const fake = fakeContainer();
  const runtime = new WebContainerRuntime({ boot: async () => fake.container });
  const untouched = projectFile("untouched.js", "untouched");
  await runtime.start([...project("original"), untouched], [], () => {}, settings);
  fake.calls.writes.length = 0;
  let untouchedReads = 0;
  untouched.text = {
    toString: () => {
      untouchedReads += 1;
      return "untouched";
    },
  } as typeof untouched.text;

  const result = await runtime.syncChangedFiles([projectFile("main.js", "changed")]);

  expect(result).toEqual({ packageChanged: false });
  expect(fake.calls.writes).toEqual(["/main.js:changed"]);
  expect(untouchedReads).toBe(0);
  runtime.dispose();
});

test("reports package changes from incremental file sync", async () => {
  const fake = fakeContainer();
  const runtime = new WebContainerRuntime({ boot: async () => fake.container });
  await runtime.start(project("original"), [], () => {}, settings);

  const result = await runtime.syncChangedFiles([
    projectFile("package.json", '{"scripts":{"dev":"node main.js"}}'),
  ]);

  expect(result).toEqual({ packageChanged: true });
  expect(fake.calls.writes).toEqual(['/package.json:{"scripts":{"dev":"node main.js"}}']);
  runtime.dispose();
});

test("keeps a pending package restart until package.json is included in a successful sync", async () => {
  const fake = fakeContainer();
  let fail = true;
  fake.container.fs.writeFile = async (path) => {
    if (path === "/broken.js" && fail) throw new Error("write failed");
  };
  const runtime = new WebContainerRuntime({ boot: async () => fake.container });
  await runtime.start(
    [...project("original"), projectFile("broken.js", "original")],
    [],
    () => {},
    settings,
  );

  await expect(
    runtime.syncChangedFiles([
      projectFile("package.json", '{"scripts":{"dev":"node main.js"}}'),
      projectFile("broken.js", "broken"),
    ]),
  ).rejects.toThrow("write failed");
  fail = false;

  expect(await runtime.syncChangedFiles([projectFile("main.js", "latest")])).toEqual({
    packageChanged: false,
  });
  expect(
    await runtime.syncChangedFiles([
      projectFile("package.json", '{"scripts":{"dev":"node main.js"}}'),
    ]),
  ).toEqual({ packageChanged: true });
  runtime.dispose();
});

test("queued incremental syncs keep the latest content for a changed file", async () => {
  const fake = fakeContainer();
  const writing = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const write = fake.container.fs.writeFile;
  fake.container.fs.writeFile = async (path, contents) => {
    if (contents === "first edit") {
      writing.resolve();
      await release.promise;
    }
    await write(path, contents);
  };
  const runtime = new WebContainerRuntime({ boot: async () => fake.container });
  await runtime.start(project("original"), [], () => {}, settings);
  fake.calls.writes.length = 0;

  const first = runtime.syncChangedFiles([projectFile("main.js", "first edit")]);
  await writing.promise;
  const second = runtime.syncChangedFiles([projectFile("main.js", "latest edit")]);
  release.resolve();
  await Promise.all([first, second]);

  expect(fake.calls.writes).toEqual(["/main.js:first edit", "/main.js:latest edit"]);
  runtime.dispose();
});

test("restart removes files no longer owned by the project before mounting replacements", async () => {
  const fake = fakeContainer();
  const runtime = new WebContainerRuntime({ boot: async () => fake.container });
  await runtime.start(project("original"), [], () => {}, settings);
  await runtime.restart([packageFile], [], () => {}, settings);

  expect(fake.calls.removes).toEqual(["/main.js"]);
  expect(fake.calls.mount).toHaveLength(2);
  runtime.dispose();
});

test("empty nested folders include implicit parents when replacing them with a file", async () => {
  const fake = fakeContainer();
  const runtime = new WebContainerRuntime({ boot: async () => fake.container });
  await runtime.start([packageFile], ["assets/nested"], () => {}, settings);
  await runtime.sync([packageFile, projectFile("assets", "file")], []);

  expect(fake.calls.removes).toEqual(["/assets/nested", "/assets"]);
  expect(fake.calls.writes).toEqual(["/assets:file"]);
  runtime.dispose();
});

test("a restart skips queued edits from the abandoned generation", async () => {
  const fake = fakeContainer();
  const writing = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const write = fake.container.fs.writeFile;
  fake.container.fs.writeFile = async (path, contents) => {
    if (contents === "first edit") {
      writing.resolve();
      await release.promise;
    }
    await write(path, contents);
  };
  const runtime = new WebContainerRuntime({ boot: async () => fake.container });
  await runtime.start(project("original"), [], () => {}, settings);
  const first = runtime.sync(project("first edit"), []);
  await writing.promise;
  const queued = runtime.sync([...project("obsolete"), projectFile("obsolete.js", "obsolete")], []);
  const restarted = runtime.restart(project("replacement"), [], () => {}, settings);
  release.resolve();
  await Promise.all([first, queued, restarted]);

  expect(fake.calls.writes).toEqual(["/main.js:first edit"]);
  expect(await queued).toEqual({ packageChanged: false });
  runtime.dispose();
});

test("an I/O failure from a disposed container does not fail its replacement", async () => {
  const fake = fakeContainer();
  const writing = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  fake.container.fs.writeFile = async () => {
    writing.resolve();
    await release.promise;
    throw new Error("container was disposed");
  };
  const runtime = new WebContainerRuntime({ boot: async () => fake.container });
  await runtime.start(project("original"), [], () => {}, settings);
  const pending = runtime.sync(project("edit"), []);
  await writing.promise;
  runtime.dispose();
  release.resolve();

  expect(await pending).toEqual({ packageChanged: false });
});

test("a retried sync still reports package changes written before a later file failed", async () => {
  const fake = fakeContainer();
  let fail = true;
  fake.container.fs.writeFile = async (path) => {
    if (path === "/main.js" && fail) throw new Error("write failed");
  };
  const runtime = new WebContainerRuntime({ boot: async () => fake.container });
  await runtime.start(project("original"), [], () => {}, settings);
  const next = [
    projectFile("package.json", '{"scripts":{"dev":"node main.js"}}'),
    projectFile("main.js", "changed"),
  ];
  await expect(runtime.sync(next, [])).rejects.toThrow("write failed");
  fail = false;

  expect(await runtime.sync(next, [])).toEqual({ packageChanged: true });
  expect(await runtime.sync(next, [])).toEqual({ packageChanged: false });
  runtime.dispose();
});
