import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  adaptLoroSource,
  createLoroStandalonePlugin,
} from "../../../scripts/loro-standalone";

const gluePath = import.meta.resolve("loro-crdt/nodejs/loro_wasm.js");
const glue = await Bun.file(new URL(gluePath)).text();

test("rejects changed Loro dynamic helper and WASM loading rather than emitting broken resources", () => {
  expect(() =>
    adaptLoroSource(glue.replace("require(String.raw`", "require(`")),
  ).toThrow("Loro");
  expect(() =>
    adaptLoroSource(glue.replace("loro_wasm_bg.wasm", "renamed.wasm")),
  ).toThrow("Loro");
  expect(() => adaptLoroSource(glue + glue)).toThrow("Loro");
});

test("bundles the installed Loro helper and WASM into an isolated runnable artifact", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tsugite-loro-build-"));
  try {
    const entry = join(directory, "entry.ts");
    await Bun.write(
      entry,
      `import { LoroDoc } from ${JSON.stringify(fileURLToPath(import.meta.resolve("loro-crdt")))}; const doc = new LoroDoc(); doc.getText("text").insert(0, "embedded"); console.log(doc.getText("text").toString());`,
    );
    const executable = join(directory, "loro-probe");
    const result = await Bun.build({
      entrypoints: [entry],
      target: "bun",
      compile: {
        outfile: executable,
        autoloadDotenv: false,
        autoloadBunfig: false,
      },
      plugins: [await createLoroStandalonePlugin()],
    });
    expect(result.success).toBe(true);
    await rm(entry);
    const child = Bun.spawn([executable], {
      cwd: "/",
      env: { PATH: "/nonexistent" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [output, errors, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(errors).toBe("");
    expect(code).toBe(0);
    expect(output.trim()).toBe("embedded");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
