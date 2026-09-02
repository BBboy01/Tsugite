import { expect, test } from "bun:test";

import { GLOBAL_HEADER_CLASS_NAME } from "./global-header";

test("keeps presence popovers above the workspace", () => {
  expect(GLOBAL_HEADER_CLASS_NAME.split(/\s+/)).toContain("z-50");
});
