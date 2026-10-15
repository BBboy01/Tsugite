import { describe, expect, spyOn, test } from "bun:test";

import { createEditorTypeScriptEnvironment } from "./typescript-environment";
import { standardLibraries } from "./typescript-test-libraries";

describe("editor TypeScript environment", () => {
  test("reports undeclared globals when explicitly created without standard libraries", () => {
    const source = "console.log(String(1));";
    const environment = createEditorTypeScriptEnvironment("app.ts", source, [], []);
    try {
      const diagnostics = environment.languageService.getSemanticDiagnostics("/app.ts");
      expect(diagnostics.some((diagnostic) => diagnostic.start === source.indexOf("console"))).toBe(
        true,
      );
      expect(diagnostics.some((diagnostic) => diagnostic.start === source.indexOf("String"))).toBe(
        true,
      );
    } finally {
      environment.languageService.dispose();
    }
  });

  test("publishes edits without building a program until a language query", () => {
    const environment = createEditorTypeScriptEnvironment(
      "src/value.ts",
      "const value = 1;",
      [],
      standardLibraries,
    );
    const getProgram = spyOn(environment.languageService, "getProgram");
    try {
      environment.updateFile("/src/value.ts", "const value = 'latest';\nvalue;");
      environment.updateFile("/src/value.ts", "const value = 'newest';\nvalue;");
      expect(getProgram).not.toHaveBeenCalled();
      expect(environment.sys.readFile("/src/value.ts")).toBe("const value = 'newest';\nvalue;");
      const info = environment.languageService.getQuickInfoAtPosition("/src/value.ts", 24);
      expect(info?.displayParts?.map((part) => part.text).join("")).toBe('const value: "newest"');
    } finally {
      getProgram.mockRestore();
      environment.languageService.dispose();
    }
  });

  test("opens a newly created empty file and accepts its first edit", () => {
    const environment = createEditorTypeScriptEnvironment(
      "src/empty.ts",
      "",
      [],
      standardLibraries,
    );
    expect(environment.getSourceFile("/src/empty.ts")?.text).toBe("");
    environment.updateFile("/src/empty.ts", "const first = 1;");
    expect(environment.getSourceFile("/src/empty.ts")?.text).toBe("const first = 1;");
    environment.languageService.dispose();
  });

  test("resolves definitions across workspace files", () => {
    const environment = createEditorTypeScriptEnvironment(
      "src/App.tsx",
      "import { value } from './value';\nvalue;",
      [{ path: "src/value.ts", text: "export const value = 1;" }],
      standardLibraries,
    );

    const position = "import { value } from './value';\n".length;
    const definition = environment.languageService.getDefinitionAtPosition(
      "/src/App.tsx",
      position,
    );

    expect(definition?.[0]?.fileName).toBe("/src/value.ts");
    environment.languageService.dispose();
  });

  test("invalidates queried types after editing, deleting, and recreating a module", () => {
    const source = "import { value } from './value';\nvalue;";
    const environment = createEditorTypeScriptEnvironment(
      "src/App.tsx",
      source,
      [{ path: "src/value.ts", text: "export const value = 1;" }],
      standardLibraries,
    );
    const hover = () =>
      environment.languageService
        .getQuickInfoAtPosition("/src/App.tsx", source.lastIndexOf("value"))
        ?.displayParts?.map((part) => part.text)
        .join("");
    try {
      expect(hover()).toContain("value: 1");
      environment.updateFile("/src/value.ts", "export const value = 'changed';");
      expect(hover()).toContain('value: "changed"');
      environment.deleteFile("/src/value.ts");
      expect(environment.getSourceFile("/src/value.ts")).toBeUndefined();
      expect(
        environment.languageService
          .getSemanticDiagnostics("/src/App.tsx")
          .some((diagnostic) => diagnostic.code === 2307),
      ).toBe(true);
      environment.createFile("/src/value.ts", "export const value = false;");
      expect(hover()).toContain("value: false");
    } finally {
      environment.languageService.dispose();
    }
  });

  test("applies text spans in UTF-16 offsets and preserves empty files", () => {
    const environment = createEditorTypeScriptEnvironment(
      "src/value.ts",
      "// \uD83D\uDE00\nconst value = 1;",
      [],
      standardLibraries,
    );
    try {
      environment.updateFile("/src/value.ts", "2", { start: 20, length: 1 });
      expect(environment.getSourceFile("/src/value.ts")?.text).toBe(
        "// \uD83D\uDE00\nconst value = 2;",
      );
      environment.updateFile("/src/value.ts", "");
      expect(environment.getSourceFile("/src/value.ts")?.text).toBe("");
      environment.updateFile("/src/value.ts", "const value = true;", { start: 0, length: 0 });
      expect(environment.getSourceFile("/src/value.ts")?.text).toBe("const value = true;");
      expect(() => environment.updateFile("/missing.ts", "text")).toThrow();
    } finally {
      environment.languageService.dispose();
    }
  });

  test("invalidates package type entrypoints after metadata changes, deletion and recreation", () => {
    const source = 'import { value } from "typed-pkg"; value;';
    const metadataPath = "/node_modules/typed-pkg/package.json";
    const environment = createEditorTypeScriptEnvironment(
      "src/App.tsx",
      source,
      [
        { path: "node_modules/typed-pkg/package.json", text: '{"types":"first.d.ts"}' },
        { path: "node_modules/typed-pkg/first.d.ts", text: "export declare const value: 1;" },
        { path: "node_modules/typed-pkg/second.d.ts", text: "export declare const value: 2;" },
        { path: "node_modules/typed-pkg/index.d.ts", text: "export declare const value: 3;" },
      ],
      standardLibraries,
    );
    const hover = () =>
      environment.languageService
        .getQuickInfoAtPosition("/src/App.tsx", source.lastIndexOf("value"))
        ?.displayParts?.map((part) => part.text)
        .join("");
    try {
      expect(hover()).toContain("value: 1");
      environment.updateFile(metadataPath, '{"types":"second.d.ts"}');
      expect(hover()).toContain("value: 2");
      environment.deleteFile(metadataPath);
      expect(hover()).toContain("value: 3");
      environment.createFile(metadataPath, '{"types":"first.d.ts"}');
      expect(hover()).toContain("value: 1");
    } finally {
      environment.languageService.dispose();
    }
  });

  test("does not build a program while publishing package metadata changes", () => {
    const metadataPath = "/node_modules/typed-pkg/package.json";
    const environment = createEditorTypeScriptEnvironment(
      "src/App.tsx",
      "export {}",
      [{ path: "node_modules/typed-pkg/package.json", text: '{"types":"first.d.ts"}' }],
      standardLibraries,
    );
    const getProgram = spyOn(environment.languageService, "getProgram");
    try {
      environment.updateFile(metadataPath, '{"types":"second.d.ts"}');
      environment.deleteFile(metadataPath);
      environment.createFile(metadataPath, '{"types":"first.d.ts"}');
      expect(getProgram).not.toHaveBeenCalled();
    } finally {
      getProgram.mockRestore();
      environment.languageService.dispose();
    }
  });
});
