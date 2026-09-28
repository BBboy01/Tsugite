import { expect, test } from "bun:test";
import i18n from "./i18n";

test("keeps the core workspace interface translated across supported languages", async () => {
  const originalLanguage = i18n.language;
  const expected = [
    ["en", "New file", "package.json is invalid.", "Showing 100 of 101 results"],
    ["zh-CN", "新建文件", "package.json 无效。", "显示 100 项，共 101 项"],
    ["zh-TW", "新增檔案", "package.json 無效。", "顯示 100 項，共 101 項"],
    ["ja", "新しいファイル", "package.json が無効です。", "101 件中 100 件を表示"],
  ] as const;

  try {
    for (const [language, newFile, invalidPackage, searchResults] of expected) {
      await i18n.changeLanguage(language);
      expect(i18n.t("files.newFile")).toBe(newFile);
      expect(i18n.t("preview.runtime.invalid-package-json")).toBe(invalidPackage);
      expect(i18n.t("files.searchResultsLimited", { shown: 100, total: 101 })).toBe(searchResults);
    }
  } finally {
    await i18n.changeLanguage(originalLanguage);
  }
  expect(i18n.language).toBe(originalLanguage);
});
