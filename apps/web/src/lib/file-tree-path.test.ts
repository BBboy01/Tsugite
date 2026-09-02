import { expect, test } from "bun:test";

import { resolveDialogPath } from "./file-tree-path";

test("resolves a short create path inside the context folder", () => {
  expect(resolveDialogPath("create-file", "src/components", "Button.tsx")).toBe(
    "src/components/Button.tsx",
  );
  expect(resolveDialogPath("create-folder", "src/components", "buttons")).toBe(
    "src/components/buttons",
  );
});

test("keeps a short create path at the root without a context folder", () => {
  expect(resolveDialogPath("create-file", "", "package.json")).toBe("package.json");
  expect(resolveDialogPath("create-folder", "", "packages")).toBe("packages");
});

test("preserves explicit paths and never prefixes rename paths", () => {
  expect(resolveDialogPath("create-file", "src", "src/shared.ts")).toBe("src/shared.ts");
  expect(resolveDialogPath("rename-file", "src", "renamed.ts")).toBe("renamed.ts");
});
