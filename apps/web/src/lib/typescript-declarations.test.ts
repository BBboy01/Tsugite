import { expect, test } from "bun:test";
import {
  DECLARATION_LIMITS,
  parseDeclarationScan,
  validateDeclarationFiles,
  type DeclarationScanResult,
} from "./typescript-declarations";

test("accepts declaration files and package metadata within the workspace budget", () => {
  const files = [
    { path: "node_modules/@types/react/index.d.ts", text: "export type Element = {};" },
    { path: "node_modules/react/package.json", text: '{"types":"index.d.ts"}' },
  ];
  expect(validateDeclarationFiles(files)).toBeUndefined();
});

test("rejects arbitrary paths, source files, duplicate paths, and oversized declarations", () => {
  for (const files of [
    [{ path: "../../src/App.tsx", text: "" }],
    [{ path: "node_modules/pkg/index.js", text: "" }],
    [
      { path: "node_modules/pkg/index.d.ts", text: "" },
      { path: "node_modules/pkg/index.d.ts", text: "duplicate" },
    ],
    [{ path: "node_modules/pkg/index.d.ts", text: "x".repeat(DECLARATION_LIMITS.fileBytes + 1) }],
  ]) {
    expect(validateDeclarationFiles(files)).toBeDefined();
  }
});

test("rejects declaration snapshots that exceed total byte and file-count limits", () => {
  const tooMany = Array.from({ length: DECLARATION_LIMITS.files + 1 }, (_, index) => ({
    path: `node_modules/pkg/file-${index}.d.ts`,
    text: "",
  }));
  const tooLarge = Array.from({ length: 9 }, (_, index) => ({
    path: `node_modules/pkg/file-${index}.d.ts`,
    text: "x".repeat(1024 * 1024),
  }));
  expect(validateDeclarationFiles(tooMany)).toContain("file limit");
  expect(validateDeclarationFiles(tooLarge)).toContain("workspace limit");
});

test("parses and revalidates scan output as untrusted data", () => {
  const valid: DeclarationScanResult = {
    status: "ok",
    files: [{ path: "node_modules/@types/react/index.d.ts", text: "export {};" }],
  };
  expect(parseDeclarationScan(JSON.stringify(valid))).toEqual(valid.files);
  expect(() => parseDeclarationScan("not json")).toThrow("Invalid declaration scan result");
  expect(() =>
    parseDeclarationScan(
      JSON.stringify({ status: "ok", files: [{ path: "../outside.d.ts", text: "" }] }),
    ),
  ).toThrow("Invalid TypeScript declaration path");
  expect(() =>
    parseDeclarationScan(JSON.stringify({ status: "disabled", reason: "budget exceeded" })),
  ).toThrow("budget exceeded");
});

test("validates UTF-8 metadata and permits nested package metadata and local declarations", () => {
  expect(
    validateDeclarationFiles([
      { path: "src/global.d.ts", text: "declare const local: string;" },
      { path: "node_modules/pkg/nested/package.json", text: '{"types":"index.d.mts"}' },
      { path: "node_modules/pkg/nested/index.d.mts", text: "export {};" },
    ]),
  ).toBeUndefined();
  for (const path of [
    "/tmp/x.d.ts",
    "file:///x.d.ts",
    "node_modules/../x.d.ts",
    "a\\x.d.ts",
    ".env.d.ts",
  ]) {
    expect(validateDeclarationFiles([{ path, text: "" }])).toBeDefined();
  }
  expect(validateDeclarationFiles([{ path: "package.json", text: "not json" }])).toBeDefined();
  expect(
    validateDeclarationFiles([
      { path: "package.json", text: JSON.stringify({ x: "界".repeat(22000) }) },
    ]),
  ).toBeDefined();
  expect(() =>
    parseDeclarationScan('{"status":"ok","files":[{"path":"x.d.ts","text":12}]}'),
  ).toThrow();
});

test("rejects invalid result structures and oversized serialized output", () => {
  for (const value of [
    null,
    [],
    {},
    { status: "ok", files: null },
    { status: "ok", files: [null] },
    { status: "disabled", reason: "" },
    { status: "disabled", reason: 1 },
  ]) {
    expect(() => parseDeclarationScan(JSON.stringify(value))).toThrow();
  }
  expect(() => parseDeclarationScan(" ".repeat(16 * 1024 * 1024 + 1))).toThrow("output limit");
  expect(() => parseDeclarationScan("界".repeat(6 * 1024 * 1024))).toThrow("output limit");
});

test("rejects non-object package metadata and UTF-8 declaration content over the byte budget", () => {
  for (const text of ["null", "[]", "12", '"types"']) {
    expect(validateDeclarationFiles([{ path: "package.json", text }])).toContain("metadata");
  }
  expect(
    validateDeclarationFiles([{ path: "node_modules/pkg/index.d.ts", text: "界".repeat(350000) }]),
  ).toContain("byte limit");
});
