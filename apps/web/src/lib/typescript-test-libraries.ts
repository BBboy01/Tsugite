import { readFile } from "node:fs/promises";
import { loadTypeScriptStandardLibrary } from "./typescript-standard-library";

export const standardLibraries = await loadTypeScriptStandardLibrary((name) =>
  readFile(
    new URL(`../../../../node_modules/typescript-legacy/lib/${name}`, import.meta.url),
    "utf8",
  ),
);
