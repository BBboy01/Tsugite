import { expect, test } from "bun:test";

import { getFileIconName, getFolderIconName } from "./file-icon";

test("normalizes paths before resolving file and folder icons", () => {
  expect(getFileIconName("src/components/Button.tsx")).toBe("Button.tsx");
  expect(getFileIconName("package.json")).toBe("package.json");
  expect(getFolderIconName("src/components")).toBe("components");
});
