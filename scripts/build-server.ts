import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { createLoroStandalonePlugin } from "./loro-standalone";

const root = join(import.meta.dir, "..");
const output = join(root, "dist/server/bun-linux-x64");
if (process.platform !== "linux" || process.arch !== "x64")
  throw new Error(
    "Build the standalone server on Linux AMD64 with the Bun npm build pinned in .bun-version",
  );
const plugin = await createLoroStandalonePlugin();
await mkdir(output, { recursive: true });
const result = await Bun.build({
  entrypoints: [join(root, "apps/server/src/index.ts")],
  target: "bun",
  compile: {
    target: "bun-linux-x64",
    executablePath: process.execPath,
    outfile: join(output, "tsugite-server"),
    autoloadDotenv: false,
    autoloadBunfig: false,
  },
  plugins: [plugin],
});
if (!result.success)
  throw new AggregateError(result.logs, "Server compile failed");
await rm(join(output, "drizzle"), { recursive: true, force: true });
await cp(join(root, "drizzle"), join(output, "drizzle"), { recursive: true });
console.info(
  `Built Linux AMD64/glibc server with Bun ${Bun.version} (${Bun.revision}) at ${output}`,
);
