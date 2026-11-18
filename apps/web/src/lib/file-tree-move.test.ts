import { expect, test } from "bun:test";
import { resolveMovePath } from "./file-tree-move";

test("resolves a colliding move path by appending a number before the extension", () => {
  expect(resolveMovePath("src/App.tsx", "src/components", ["src/components/App.tsx"], [])).toBe(
    "src/components/App 2.tsx",
  );
});

test("resolves directory collisions and preserves multi-dot file names", () => {
  expect(resolveMovePath("a.test.ts", "src", ["src/a.test.ts"], [])).toBe("src/a.test 2.ts");
  expect(resolveMovePath("src", "", [], ["src"])).toBe("src 2");
});

test("does not rename when the destination path is available", () => {
  expect(resolveMovePath("src/App.tsx", "src/ui", [], [])).toBe("src/ui/App.tsx");
});
