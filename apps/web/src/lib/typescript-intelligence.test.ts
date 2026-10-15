import { describe, expect, test } from "bun:test";
import { createTypeScriptIntelligence } from "./typescript-intelligence";
import { standardLibraries } from "./typescript-test-libraries";
import type { IntelligenceResult } from "./editor-intelligence";

function value<T>(result: IntelligenceResult<T>): T {
  expect(result.status).toBe("ok");
  if (result.status !== "ok") throw new Error(`Expected ok, received ${result.status}`);
  return result.value;
}

describe("TypeScript intelligence plain-data boundary", () => {
  test("workspace subscribers observe complete updates and detach on unsubscribe", async () => {
    const engine = createTypeScriptIntelligence("app.ts", "export {};", [], standardLibraries);
    const revisions: number[] = [];
    const stop = engine.subscribeWorkspace(() => revisions.push(engine.workspaceVersion));
    await engine.syncWorkspace([
      { path: "app.ts", text: "export {};" },
      { path: "other.ts", text: "export const value = 1;" },
      { path: "third.ts", text: "export const next = 1;" },
    ]);
    expect(revisions).toEqual([2]);
    await engine.updateFile({ path: "other.ts", text: "export const value = 1;" });
    expect(revisions).toEqual([2]);
    stop();
    await engine.updateFile({ path: "other.ts", text: "export const value = 2;" });
    expect(revisions).toEqual([2]);
    engine.dispose();
  });
  test("returns const literal hover and documentation with UTF-16 ranges", async () => {
    const source = "/** A <safe> value. */\nconst value = 1;\n// \uD83D\uDE00\nvalue;";
    const engine = createTypeScriptIntelligence("value.ts", source, [], standardLibraries);
    try {
      expect(
        value(await engine.hover({ path: "value.ts", position: source.lastIndexOf("value") })),
      ).toEqual({
        from: source.lastIndexOf("value"),
        to: source.lastIndexOf("value") + 5,
        signature: "const value: 1",
        documentation: "A <safe> value.",
      });
    } finally {
      engine.dispose();
    }
  });

  test("returns member completion replacement ranges", async () => {
    const source = "const object = { alpha: 1, beta: true };\nobject.al";
    const engine = createTypeScriptIntelligence("value.ts", source, [], standardLibraries);
    try {
      const entries = value(await engine.completion({ path: "value.ts", position: source.length }));
      expect(entries.find((entry) => entry.name === "alpha")).toMatchObject({
        name: "alpha",
        kind: "property",
      });
    } finally {
      engine.dispose();
    }
  });

  test("uses TypeScript's optional replacement span for a caret inside a property", async () => {
    const source = "const object = { alpha: 1, beta: true };\nobject.alpha";
    const engine = createTypeScriptIntelligence("value.ts", source, [], standardLibraries);
    try {
      const position = source.lastIndexOf("alpha") + 2;
      const entries = value(await engine.completion({ path: "value.ts", position }));
      expect(entries.find((entry) => entry.name === "alpha")?.replacement).toEqual({
        from: source.lastIndexOf("alpha"),
        to: source.length,
      });
    } finally {
      engine.dispose();
    }
  });

  test("reports the active signature parameter and documentation", async () => {
    const source =
      "/** Join values. */\nfunction join(first: string, second: number) {}\njoin('one', ";
    const engine = createTypeScriptIntelligence("value.ts", source, [], standardLibraries);
    try {
      const help = value(await engine.signatureHelp({ path: "value.ts", position: source.length }));
      expect(help.activeParameter).toBe(1);
      expect(
        help.signatures[help.activeSignature]?.parameters.map((parameter) => parameter.label),
      ).toEqual(["first: string", "second: number"]);
      expect(help.signatures[0]?.documentation).toBe("Join values.");
    } finally {
      engine.dispose();
    }
  });

  test("returns syntax and semantic diagnostics as JSON-safe data", async () => {
    const source = "const count: number = 'wrong';\nconst broken = ;";
    const engine = createTypeScriptIntelligence("value.ts", source, [], standardLibraries);
    try {
      const diagnostics = value(await engine.diagnostics({ path: "value.ts" }));
      expect(diagnostics.some((item) => item.code === 2322 && item.severity === "error")).toBe(
        true,
      );
      expect(diagnostics.some((item) => item.code === 1109)).toBe(true);
      expect(JSON.parse(JSON.stringify(diagnostics))).toEqual(diagnostics);
    } finally {
      engine.dispose();
    }
  });

  test("uses official standard libraries for global value diagnostics", async () => {
    const source = "const value = String(1); console.log(value);";
    const engine = createTypeScriptIntelligence("value.ts", source, [], standardLibraries);
    try {
      expect(await engine.diagnostics({ path: "value.ts" })).toEqual({ status: "empty" });
    } finally {
      engine.dispose();
    }
  });

  test("synchronizes remote edits, deletion and recreation before cross-file navigation", async () => {
    const source = "import { value } from './value';\nvalue;";
    const active = { path: "app.ts", text: source };
    const engine = createTypeScriptIntelligence(
      active.path,
      source,
      [{ path: "value.ts", text: "export const value = 1;" }],
      standardLibraries,
    );
    const query = { path: active.path, position: source.lastIndexOf("value") };
    try {
      expect(value(await engine.definition(query))[0]).toMatchObject({
        path: "value.ts",
        from: 13,
        line: 1,
        column: 14,
      });
      value(
        await engine.syncWorkspace([
          active,
          { path: "value.ts", text: "// \uD83D\uDE00\nexport const value = true;" },
        ]),
      );
      expect(value(await engine.definition(query))[0]).toMatchObject({
        from: 19,
        line: 2,
        column: 14,
      });
      expect(value(await engine.hover(query)).signature).toContain("value: true");
      value(await engine.syncWorkspace([active]));
      const deleted = await engine.definition(query);
      expect(
        deleted.status === "empty" ||
          (deleted.status === "ok" && deleted.value.every((item) => item.path !== "value.ts")),
      ).toBe(true);
      value(await engine.updateFile({ path: "value.ts", text: "export const value = 'again';" }));
      expect(value(await engine.hover(query)).signature).toContain('value: "again"');
      expect(value(await engine.references(query)).some((item) => item.path === "value.ts")).toBe(
        true,
      );
    } finally {
      engine.dispose();
    }
  });

  test("resolves types and implementations and represents missing targets explicitly", async () => {
    const source =
      "interface Shape { size: number }\nclass Box implements Shape { size = 1 }\nconst shape: Shape = new Box();\nshape;";
    const engine = createTypeScriptIntelligence("types.ts", source, [], standardLibraries);
    try {
      expect(
        value(
          await engine.typeDefinition({ path: "types.ts", position: source.lastIndexOf("shape") }),
        )[0]?.line,
      ).toBe(1);
      expect(
        value(
          await engine.implementation({ path: "types.ts", position: source.indexOf("Shape") }),
        ).some((item) => item.line === 2),
      ).toBe(true);
      expect(await engine.definition({ path: "types.ts", position: source.length })).toEqual({
        status: "empty",
      });
      expect(await engine.hover({ path: "missing.ts", position: 0 })).toEqual({ status: "empty" });
      expect(await engine.hover({ path: "types.ts", position: -1 })).toMatchObject({
        status: "error",
      });
    } finally {
      engine.dispose();
    }
  });

  test("cancels pending queries, applies deadlines and disposes idempotently", async () => {
    const engine = createTypeScriptIntelligence(
      "value.ts",
      "const value = 1;",
      [],
      standardLibraries,
    );
    const pending = engine.hover({ path: "value.ts", position: 6, requestId: "hover" });
    engine.cancel("hover");
    expect(await pending).toEqual({ status: "cancelled" });
    expect(await engine.hover({ path: "value.ts", position: 6, timeoutMs: 0 })).toEqual({
      status: "timeout",
    });
    engine.dispose();
    engine.dispose();
    expect(await engine.hover({ path: "value.ts", position: 6 })).toEqual({ status: "disposed" });
    expect(await engine.syncWorkspace([])).toEqual({ status: "disposed" });
  });

  test("rejects a query bound to an older workspace revision", async () => {
    const source = "const value = 1;\nvalue;";
    const engine = createTypeScriptIntelligence("value.ts", source, [], standardLibraries);
    try {
      const synced = await engine.syncWorkspace([{ path: "value.ts", text: source }]);
      expect(synced.status).toBe("ok");
      if (synced.status !== "ok") return;
      await engine.updateFile({ path: "value.ts", text: "const value = 2;\nvalue;" });
      expect(
        await engine.hover({
          path: "value.ts",
          position: source.lastIndexOf("value"),
          revision: synced.value,
        }),
      ).toEqual({ status: "cancelled" });
    } finally {
      engine.dispose();
    }
  });
});
