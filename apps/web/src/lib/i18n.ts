import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { detectLanguage, languageOptions } from "./i18n-config";
import { uxTranslations } from "./i18n-ux";
import { draftTranslations } from "./i18n-drafts";
import { englishTranslations } from "./i18n-en";
import { simplifiedChineseTranslations } from "./i18n-zh-cn";
import { traditionalChineseTranslations } from "./i18n-zh-tw";
import { japaneseTranslations } from "./i18n-ja";

export { languageOptions, type LanguageCode } from "./i18n-config";

const resources = {
  en: {
    translation: { ...uxTranslations["en"], ...draftTranslations["en"], ...englishTranslations },
  },
  "zh-CN": {
    translation: {
      ...uxTranslations["zh-CN"],
      ...draftTranslations["zh-CN"],
      ...simplifiedChineseTranslations,
    },
  },
  "zh-TW": {
    translation: {
      ...uxTranslations["zh-TW"],
      ...draftTranslations["zh-TW"],
      ...traditionalChineseTranslations,
    },
  },
  ja: {
    translation: { ...uxTranslations["ja"], ...draftTranslations["ja"], ...japaneseTranslations },
  },
} as const;

function syncLanguageMetadata(language: string): void {
  if (typeof document !== "undefined") document.documentElement.lang = language;
  if (typeof window !== "undefined") window.localStorage.setItem("iris.language", language);
}

i18n.on("languageChanged", syncLanguageMetadata);

void i18n
  .use(initReactI18next)
  .init({
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    keySeparator: false,
    lng: detectLanguage(),
    resources,
    supportedLngs: languageOptions.map((option) => option.code),
  })
  .then(() => syncLanguageMetadata(i18n.language));

export default i18n;
