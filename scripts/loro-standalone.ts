import type { BunPlugin } from "bun";
import { dirname, join } from "node:path";

const helper = "./snippets/loro-wasm-4a7c6dd15e785db1/inline0.js";
const dynamicHelper = "require(String.raw`" + helper + "`)";
const wasmPath =
  "const path = require('path').join(__dirname, 'loro_wasm_bg.wasm');";

export function adaptLoroSource(source: string) {
  for (const expected of [dynamicHelper, wasmPath]) {
    if (source.split(expected).length !== 2)
      throw new Error(
        "Unexpected Loro Node resource layout; review the standalone adapter before building",
      );
  }
  return `import embeddedWasm from "./loro_wasm_bg.wasm" with { type: "file" };\n${source
    .replace(dynamicHelper, `require(${JSON.stringify(helper)})`)
    .replace(wasmPath, "const path = embeddedWasm;")}`;
}

export async function createLoroStandalonePlugin(): Promise<BunPlugin> {
  const entry = Bun.resolveSync(
    "loro-crdt/nodejs/loro_wasm.js",
    join(import.meta.dir, "../apps/server"),
  );
  const directory = dirname(entry);
  const metadata = await Bun.file(join(directory, "../package.json")).json();
  if (metadata.version !== "1.18.0")
    throw new Error(
      `Loro ${metadata.version} has not been validated for standalone builds`,
    );
  if (!(await Bun.file(join(directory, helper)).exists()))
    throw new Error("Loro standalone helper is missing");
  const wasm = await Bun.file(
    join(directory, "loro_wasm_bg.wasm"),
  ).arrayBuffer();
  if (!WebAssembly.validate(wasm))
    throw new Error("Loro standalone WASM is invalid");
  const contents = adaptLoroSource(await Bun.file(entry).text());
  return {
    name: "loro-standalone",
    setup(build) {
      build.onLoad({ filter: /loro_wasm\.js$/ }, ({ path }) => {
        if (path !== entry) return;
        return { contents, loader: "js", resolveDir: directory };
      });
    },
  };
}
