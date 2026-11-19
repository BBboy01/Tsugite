import { expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import { constants } from "node:fs";
import * as path from "node:path";
import { tmpdir } from "node:os";
import { scanNodeDeclarations, type DeclarationScanEnvironment } from "./declaration-scan-node";
import { createDeclarationReferenceReader } from "./declaration-scan-references";
import { DECLARATION_SCAN_LIMITS, type DeclarationScanLimits } from "./declaration-scan-limits";

async function fixture(run: (environment: DeclarationScanEnvironment) => Promise<void>) {
  const cwd = await fs.mkdtemp(path.join(tmpdir(), "iris-typed-scan-"));
  try {
    await fs.mkdir(path.join(cwd, "node_modules/pkg"), { recursive: true });
    await fs.writeFile(path.join(cwd, "package.json"), '{"dependencies":{"pkg":"1"}}');
    await fs.writeFile(path.join(cwd, "node_modules/pkg/index.d.ts"), "export interface Value {}");
    await run({ fs, constants, path, buffer: Buffer, cwd, now: Date.now });
  } finally {
    await fs.rm(cwd, { recursive: true, force: true });
  }
}

const scan = (
  environment: DeclarationScanEnvironment,
  limits: Partial<DeclarationScanLimits> = {},
) =>
  scanNodeDeclarations(
    environment,
    { ...DECLARATION_SCAN_LIMITS, ...limits },
    createDeclarationReferenceReader,
  );

test("typed Node scanner reads declarations without executing package code", async () => {
  await fixture(async (environment) => {
    await fs.writeFile(
      path.join(environment.cwd, "node_modules/pkg/index.js"),
      'throw new Error("must not run")',
    );
    expect(await scan(environment)).toContainEqual({
      path: "node_modules/pkg/index.d.ts",
      text: "export interface Value {}",
    });
  });
});

test("small injected limits bound files, bytes, metadata, entries and serialized output", async () => {
  await fixture(async (environment) => {
    for (const [limits, message] of [
      [{ files: 1 }, "file limit"],
      [{ fileBytes: 2 }, "byte limit"],
      [{ totalBytes: 2 }, "workspace limit"],
      [{ metadataBytes: 2 }, "byte limit"],
      [{ entries: 0 }, "entry limit"],
      [{ outputBytes: 2 }, "output limit"],
    ] as const) {
      await expect(scan(environment, limits)).rejects.toThrow(message);
    }
  });
});

test("Node deadline is enforced from the same injected limit used by the host", async () => {
  await fixture(async (environment) => {
    let tick = 0;
    await expect(scan({ ...environment, now: () => tick++ }, { deadlineMs: 1 })).rejects.toThrow(
      "deadline",
    );
  });
});

test("Node source requests validate shared file, byte and encoded request limits", async () => {
  await fixture(async (environment) => {
    for (const limits of [
      { sourceFiles: 0 },
      { sourceFileBytes: 1 },
      { sourceTotalBytes: 1 },
      { sourceRequestBytes: 1 },
    ]) {
      const sourceArgument = Buffer.from(
        JSON.stringify([{ path: "app.ts", text: "const value = 1;" }]),
      ).toString("base64");
      await expect(scan({ ...environment, sourceArgument }, limits)).rejects.toThrow(
        "source request",
      );
    }
  });
});

test("environment paths are rejected before the filesystem can open their targets", async () => {
  await fixture(async (environment) => {
    const fileSystem = new Proxy(fs, {
      get(target, property) {
        if (property !== "lstat") return Reflect.get(target, property);
        return async (...args: Parameters<typeof fs.lstat>) => {
          if (
            String(args[0])
              .split(path.sep)
              .some((part) => part.startsWith(".env"))
          ) {
            throw new Error("environment path must not be inspected");
          }
          return fs.lstat(...args);
        };
      },
    });
    await fs.symlink(".env.d.ts", path.join(environment.cwd, "node_modules/pkg/alias.d.ts"));
    await expect(scan({ ...environment, fs: fileSystem })).rejects.toThrow(
      "Invalid declaration path",
    );
  });
});
