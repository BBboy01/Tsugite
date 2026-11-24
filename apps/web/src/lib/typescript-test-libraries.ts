import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { loadTypeScriptStandardLibrary } from "./typescript-standard-library";

const require = createRequire(import.meta.url);
const libraryDirectory = join(
  dirname(require.resolve("typescript-legacy/package.json")),
  "lib",
);

export const readStandardLibrary = (name: string) =>
  readFile(join(libraryDirectory, name), "utf8");

export const standardLibraries =
  await loadTypeScriptStandardLibrary(readStandardLibrary);
