import { describe, expect, test } from "bun:test";

import { createEditorTypeScriptEnvironment } from "./typescript-environment";

describe("editor TypeScript environment", () => {
  test("resolves definitions across workspace files", () => {
    const environment = createEditorTypeScriptEnvironment(
      "src/App.tsx",
      "import { value } from './value';\nvalue;",
      [{ path: "src/value.ts", text: "export const value = 1;" }],
    );

    const position = "import { value } from './value';\n".length;
    const definition = environment.languageService.getDefinitionAtPosition(
      "/src/App.tsx",
      position,
    );

    expect(definition?.[0]?.fileName).toBe("/src/value.ts");
  });
});
