import { expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  DECLARATION_SCAN_SCRIPT,
  scanWebContainerDeclarations,
} from "./webcontainer-declaration-scan";
import { parseDeclarationScan } from "./typescript-declarations";
import type { RuntimeContainer } from "./webcontainer-runtime";
import { fakeContainer } from "./webcontainer-test-utils";

async function fixture(files: Record<string, string>, run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "iris-declarations-"));
  try {
    for (const [path, text] of Object.entries(files)) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), text);
    }
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function scan(root: string, sources?: { path: string; text: string }[]) {
  const child = Bun.spawn(
    [
      "node",
      "-e",
      DECLARATION_SCAN_SCRIPT,
      ...(sources ? [Buffer.from(JSON.stringify(sources)).toString("base64")] : []),
    ],
    {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
      env: { PATH: process.env.PATH },
    },
  );
  const output = await new Response(child.stdout).text();
  expect(await child.exited).toBe(0);
  return parseDeclarationScan(output.replace(/^IRIS_DECLARATION_SCAN_READY:/, ""));
}

test("preserves scanner and Unicode source data through WebContainer argument unescaping", async () => {
  await fixture(
    { "package.json": "{}", "node_modules/pkg/index.d.ts": "export {};" },
    async (root) => {
      const container = {
        spawn: async (command: string, args: string[]) => {
          const child = Bun.spawn(
            [command, ...args.map((argument) => argument.replace(/\\(.)/gs, "$1"))],
            {
              cwd: root,
              stdout: "pipe",
              stderr: "pipe",
              env: { PATH: process.env.PATH },
            },
          );
          const output = child.stdout.pipeThrough(new TextDecoderStream());
          return { output, exit: child.exited, kill: () => child.kill() };
        },
      } as RuntimeContainer;
      const files = await scanWebContainerDeclarations(
        container,
        [
          {
            path: "src/界.ts",
            text: 'import {\n Thing\n} from "pkg"; const label = "界\\\\path";',
          },
        ],
        new AbortController().signal,
        15000,
        2000,
      );
      expect(files.map((file) => file.path)).toContain("node_modules/pkg/index.d.ts");
    },
  );
});

test("separates bounded Node startup from scan deadline and handles fragmented ready output", async () => {
  const container = fakeContainer().container;
  container.spawn = async () => ({
    output: new ReadableStream<string>({
      async start(controller) {
        await Bun.sleep(20);
        controller.enqueue("IRIS_DECLARATION_SCAN_");
        controller.enqueue('READY:{"status":"ok","files":[]}');
        controller.close();
      },
    }),
    exit: Promise.resolve(0),
    kill() {},
  });
  await expect(
    scanWebContainerDeclarations(container, undefined, new AbortController().signal, 100, 10),
  ).resolves.toEqual([]);
  let killed = false;
  container.spawn = async () => ({
    output: new ReadableStream({
      start(controller) {
        controller.enqueue("IRIS_DECLARATION_SCAN_READY:");
      },
    }),
    exit: new Promise(() => {}),
    kill() {
      killed = true;
    },
  });
  await expect(
    scanWebContainerDeclarations(container, undefined, new AbortController().signal, 100, 10),
  ).rejects.toThrow("timed out");
  expect(killed).toBe(true);
});

test("actual node script collects React, companion types, nested metadata, and transitive references without executing packages", async () => {
  await fixture(
    {
      "package.json": JSON.stringify({ dependencies: { react: "1", pkg: "1" } }),
      "node_modules/react/package.json": '{"main":"index.js"}',
      "node_modules/react/index.js": 'throw new Error("must not execute")',
      "node_modules/@types/react/package.json": '{"types":"index.d.ts"}',
      "node_modules/@types/react/index.d.ts":
        'import * as CSS from "csstype"; export type Style = CSS.Properties;',
      "node_modules/csstype/package.json": '{"typings":"index.d.ts"}',
      "node_modules/csstype/index.d.ts":
        '/// <reference types="leaf"/>\nexport interface Properties {}',
      "node_modules/@types/leaf/index.d.ts": "export {};",
      "node_modules/pkg/package.json": '{"exports":{".":{"types":"./nested/index.d.mts"}}}',
      "node_modules/pkg/nested/package.json": '{"type":"module"}',
      "node_modules/pkg/nested/index.d.mts": "export {};",
      "node_modules/unused/index.d.ts": "export {};",
    },
    async (root) => {
      const files = await scan(root);
      expect(files.map((file) => file.path)).toContain("node_modules/@types/react/index.d.ts");
      expect(files.map((file) => file.path)).toContain("node_modules/csstype/index.d.ts");
      expect(files.map((file) => file.path)).toContain("node_modules/@types/leaf/index.d.ts");
      expect(files.map((file) => file.path)).toContain("node_modules/pkg/nested/package.json");
      expect(files.map((file) => file.path)).not.toContain("node_modules/unused/index.d.ts");
      expect(files.every((file) => !file.path.endsWith(".js"))).toBe(true);
    },
  );
});

test("reads source imports and type references as data and follows entry metadata in subdirectories", async () => {
  await fixture(
    {
      "package.json": "{}",
      "node_modules/pkg/package.json":
        '{"typesVersions":{"*":{"*": ["declarations/*"]}},"typings":"declarations/index.d.ts"}',
      "node_modules/pkg/declarations/index.d.ts": 'export * from "./next";',
      "node_modules/pkg/declarations/next.d.ts": "export interface Next {}",
      "node_modules/@types/source/index.d.ts": "export {};",
    },
    async (root) => {
      const files = await scan(root, [
        {
          path: "src/App.ts",
          text: 'import type { Next } from "pkg";\n/// <reference types="source" />\nconst unsafe = \'");process.exit(1);//\';',
        },
      ]);
      expect(files.map((file) => file.path)).toContain("node_modules/pkg/declarations/next.d.ts");
      expect(files.map((file) => file.path)).toContain("node_modules/@types/source/index.d.ts");
    },
  );
});

test("reports an imported JavaScript package without declarations as unavailable", async () => {
  await fixture(
    {
      "package.json": "{}",
      "node_modules/js-only/package.json": '{"main":"index.js"}',
    },
    async (root) => {
      await expect(
        scan(root, [{ path: "app.ts", text: 'import value from "js-only";' }]),
      ).rejects.toThrow("TypeScript declarations missing: js-only");
    },
  );
});

test("reports absent imported packages but does not require types for unimported tooling", async () => {
  await fixture(
    {
      "package.json": '{"devDependencies":{"tool":"1"},"optionalDependencies":{"missing":"1"}}',
      "node_modules/tool/package.json": '{"main":"index.js"}',
    },
    async (root) => {
      expect((await scan(root)).map((file) => file.path)).toContain(
        "node_modules/tool/package.json",
      );
      await expect(scan(root, [{ path: "app.ts", text: 'import "missing";' }])).rejects.toThrow(
        "TypeScript declarations missing: missing",
      );
    },
  );
});

test("accepts source imports supplied by scoped companion types or ambient declarations", async () => {
  await fixture(
    {
      "package.json": '{"devDependencies":{"ambient":"1"}}',
      "node_modules/@scope/pkg/package.json": '{"main":"index.js"}',
      "node_modules/@types/scope__pkg/index.d.ts": "export interface Value {}",
      "node_modules/ambient/index.d.ts": 'declare module "virtual-pkg" {}',
    },
    async (root) => {
      const files = await scan(root, [
        {
          path: "app.ts",
          text: 'import "@scope/pkg"; import "virtual-pkg"; import "local-pkg"; import "custom-loader"; import "virtual/subpath"; import "assets/icon";',
        },
        {
          path: "ambient.d.ts",
          text: 'declare module "local-pkg" {} declare module "custom-*" {} declare module "virtual/subpath" {} declare module "assets/*" {}',
        },
      ]);
      expect(files.map((file) => file.path)).toContain("node_modules/@types/scope__pkg/index.d.ts");
    },
  );
});

test("returns available declarations when optional dependencies are absent", async () => {
  await fixture(
    {
      "package.json": '{"dependencies":{"pkg":"1"},"optionalDependencies":{"missing":"1"}}',
      "node_modules/pkg/index.d.ts": "export {};",
    },
    async (root) => {
      expect((await scan(root)).map((file) => file.path)).toContain("node_modules/pkg/index.d.ts");
    },
  );
});

test("finds multiline import declarations without treating local aliases as package paths", async () => {
  await fixture(
    { "package.json": "{}", "node_modules/pkg/index.d.ts": "export {};" },
    async (root) => {
      const files = await scan(root, [
        {
          path: "src/App.ts",
          text: 'import {\n Thing\n} from "pkg";\nimport local from "@/local";\nimport internal from "#internal";',
        },
      ]);
      expect(files.map((file) => file.path)).toContain("node_modules/pkg/index.d.ts");
    },
  );
});

test("ignores import-looking strings and comments while scanning source dependencies", async () => {
  await fixture(
    {
      "package.json": '{"dependencies":{"pkg":"1"}}',
      "node_modules/pkg/index.d.ts": "export {};",
    },
    async (root) => {
      const files = await scan(root, [
        {
          path: "src/App.ts",
          text: `const example = 'import "https://example.test/pkg"'; // import "https://example.test/comment"\nconst pattern = /import "https:\\/\\/example.test\\/pkg"/;`,
        },
      ]);
      expect(files.map((file) => file.path)).toContain("node_modules/pkg/index.d.ts");
    },
  );
});

test("finds dynamic imports inside template expressions", async () => {
  await fixture(
    { "package.json": "{}", "node_modules/pkg/index.d.ts": "export {};" },
    async (root) => {
      const files = await scan(root, [
        { path: "src/App.ts", text: 'const loaded = `value ${import("pkg")}`;' },
      ]);
      expect(files.map((file) => file.path)).toContain("node_modules/pkg/index.d.ts");
    },
  );
});

test("does not follow non-declaration symlinks or ignore malformed and oversized package metadata", async () => {
  await fixture(
    { "package.json": '{"dependencies":{"pkg":"1"}}', "node_modules/pkg/index.d.ts": "export {};" },
    async (root) => {
      await symlink("/does-not-exist", join(root, "node_modules/pkg/arbitrary.js"));
      expect((await scan(root)).map((file) => file.path)).toContain("node_modules/pkg/index.d.ts");
    },
  );
  for (const metadata of ["not json", JSON.stringify({ large: "x".repeat(64 * 1024) })]) {
    await fixture(
      { "package.json": '{"dependencies":{"pkg":"1"}}', "node_modules/pkg/package.json": metadata },
      async (root) => {
        await expect(scan(root)).rejects.toThrow();
      },
    );
  }
});

test("fails closed on symlink loops and package-local declaration escapes", async () => {
  await fixture(
    { "package.json": '{"dependencies":{"pkg":"1"}}', "node_modules/pkg/index.d.ts": "export {};" },
    async (root) => {
      await symlink("loop.d.ts", join(root, "node_modules/pkg/loop.d.ts"));
      await expect(scan(root)).rejects.toThrow();
    },
  );
  await fixture(
    { "package.json": '{"dependencies":{"pkg":"1"}}', "node_modules/pkg/placeholder": "" },
    async (root) => {
      await symlink("/does-not-exist/outside.d.ts", join(root, "node_modules/pkg/index.d.ts"));
      await expect(scan(root)).rejects.toThrow();
    },
  );
});

test("rejects dangling package escapes and aliases to non-declaration or environment files", async () => {
  await fixture(
    { "package.json": '{"dependencies":{"pkg":"1"}}', "node_modules/placeholder": "" },
    async (root) => {
      await symlink("/does-not-exist/pkg", join(root, "node_modules/pkg"));
      await expect(scan(root)).rejects.toThrow("outside");
    },
  );
  await fixture(
    { "package.json": '{"dependencies":{"pkg":"1"}}', "node_modules/pkg/index.js": "export {};" },
    async (root) => {
      await symlink("index.js", join(root, "node_modules/pkg/index.d.ts"));
      await expect(scan(root)).rejects.toThrow("file kind");
    },
  );
  await fixture({ "node_modules/placeholder": "" }, async (root) => {
    await symlink(".env", join(root, "package.json"));
    await expect(scan(root)).rejects.toThrow("path");
  });
});

test("bounds file count, directory entries, aggregate bytes, and JSON escaping", async () => {
  for (const files of [
    Object.fromEntries(
      Array.from({ length: 1025 }, (_, index) => [`node_modules/pkg/${index}.d.ts`, ""]),
    ),
    Object.fromEntries(
      Array.from({ length: 8193 }, (_, index) => [`node_modules/pkg/${index}.js`, ""]),
    ),
    Object.fromEntries(
      Array.from({ length: 9 }, (_, index) => [
        `node_modules/pkg/${index}.d.ts`,
        "x".repeat(1024 * 1024),
      ]),
    ),
    Object.fromEntries(
      Array.from({ length: 7 }, (_, index) => [
        `node_modules/pkg/${index}.d.ts`,
        "\u0001".repeat(1024 * 1024),
      ]),
    ),
  ]) {
    await fixture({ "package.json": '{"dependencies":{"pkg":"1"}}', ...files }, async (root) => {
      await expect(scan(root)).rejects.toThrow("limit");
    });
  }
}, 10000);

test("resolves pnpm physical symlinks while retaining virtual package and dependency paths", async () => {
  await fixture(
    {
      "package.json": '{"dependencies":{"pkg":"1"}}',
      "node_modules/.pnpm/pkg@1/node_modules/pkg/package.json": '{"types":"index.d.ts"}',
      "node_modules/.pnpm/pkg@1/node_modules/pkg/index.d.ts": 'export * from "child";',
      "node_modules/.pnpm/child@1/node_modules/child/index.d.cts": "export {};",
    },
    async (root) => {
      await symlink(".pnpm/pkg@1/node_modules/pkg", join(root, "node_modules/pkg"));
      await symlink(
        "../../child@1/node_modules/child",
        join(root, "node_modules/.pnpm/pkg@1/node_modules/child"),
      );
      const files = await scan(root);
      expect(files.map((file) => file.path)).toContain("node_modules/pkg/index.d.ts");
      expect(files.map((file) => file.path)).toContain(
        "node_modules/pkg/node_modules/child/index.d.cts",
      );
      expect(files.every((file) => !file.path.includes(".pnpm"))).toBe(true);
    },
  );
});

test("fails closed on escaping symlinks, declaration byte budgets, and malicious dependency paths", async () => {
  for (const dependency of ["../outside", "file:///tmp/pkg"]) {
    await fixture(
      { "package.json": JSON.stringify({ dependencies: { [dependency]: "1" } }) },
      async (root) => {
        await expect(scan(root)).rejects.toThrow();
      },
    );
  }
  await fixture(
    { "package.json": '{"dependencies":{"pkg":"1"}}', "node_modules/placeholder": "" },
    async (root) => {
      await symlink(tmpdir(), join(root, "node_modules/pkg"));
      await expect(scan(root)).rejects.toThrow("outside");
    },
  );
  await fixture(
    {
      "package.json": '{"dependencies":{"pkg":"1"}}',
      "node_modules/pkg/index.d.ts": "x".repeat(1024 * 1024 + 1),
    },
    async (root) => {
      await expect(scan(root)).rejects.toThrow("byte limit");
    },
  );
});
