import { expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite";
import { parseDeclarationScan } from "./typescript-declarations";

test("Vite minification preserves a self-contained Node scanner and reference reader", async () => {
  const result = await build({
    configFile: false,
    envFile: false,
    logLevel: "silent",
    build: {
      write: false,
      minify: true,
      lib: {
        entry: join(import.meta.dir, "webcontainer-declaration-scan.ts"),
        formats: ["es"],
      },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap(
    (output) => ("output" in output ? output.output : []),
  );
  const bundle = outputs.find((output) => output.type === "chunk");
  if (!bundle || bundle.type !== "chunk")
    throw new Error("Missing scanner bundle");
  const moduleUrl =
    "data:text/javascript;base64," +
    Buffer.from(bundle.code).toString("base64");
  const generator = Bun.spawn(
    [
      "node",
      "--input-type=module",
      "-e",
      `import { DECLARATION_SCAN_SCRIPT } from ${JSON.stringify(moduleUrl)}; process.stdout.write(DECLARATION_SCAN_SCRIPT);`,
    ],
    { stdout: "pipe", stderr: "pipe", env: { PATH: process.env.PATH } },
  );
  const script = await new Response(generator.stdout).text();
  const generationError = await new Response(generator.stderr).text();
  expect(await generator.exited, generationError).toBe(0);
  expect(script.length).toBeGreaterThan(100);
  const cwd = await mkdtemp(join(tmpdir(), "iris-minified-scan-"));
  try {
    await mkdir(join(cwd, "node_modules/pkg"), { recursive: true });
    await writeFile(join(cwd, "package.json"), "{}");
    await writeFile(
      join(cwd, "node_modules/pkg/index.d.ts"),
      "export interface Value {}",
    );
    const sources = Buffer.from(
      JSON.stringify([
        { path: "src/界.ts", text: 'const loaded = `value ${import("pkg")}`;' },
      ]),
    ).toString("base64");
    const scanner = Bun.spawn(["node", "-e", script, sources], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      env: { PATH: process.env.PATH },
    });
    const output = await new Response(scanner.stdout).text();
    const scanError = await new Response(scanner.stderr).text();
    expect(await scanner.exited, scanError).toBe(0);
    expect(
      parseDeclarationScan(output.replace(/^IRIS_DECLARATION_SCAN_READY:/, "")),
    ).toContainEqual({
      path: "node_modules/pkg/index.d.ts",
      text: "export interface Value {}",
    });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}, 10000);
