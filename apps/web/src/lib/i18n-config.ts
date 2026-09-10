export const languageOptions = [
  { code: "en", label: "English" },
  { code: "zh-CN", label: "简体中文" },
  { code: "zh-TW", label: "繁體中文" },
  { code: "ja", label: "日本語" },
] as const;

export type LanguageCode = (typeof languageOptions)[number]["code"];

export function detectLanguage(): LanguageCode {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem("iris.language");
  if (languageOptions.some((option) => option.code === stored)) return stored as LanguageCode;
  const browserLanguage = navigator.language.toLowerCase();
  if (browserLanguage.startsWith("zh-tw") || browserLanguage.startsWith("zh-hk")) return "zh-TW";
  if (browserLanguage.startsWith("zh")) return "zh-CN";
  if (browserLanguage.startsWith("ja")) return "ja";
  return "en";
}
