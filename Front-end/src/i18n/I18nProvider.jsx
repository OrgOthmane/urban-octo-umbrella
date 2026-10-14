import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import fr from "./locales/fr.json";
import ar from "./locales/ar.json";

export const SUPPORTED_LANGS = [
  { code: "fr", label: "Français", flag: "🇫🇷", dir: "ltr" },
  { code: "ar", label: "العربية", flag: "🇲🇦", dir: "rtl" },
];

const DICTS = { fr, ar };
export const STORAGE_KEY = "app_lang";
const DEFAULT_LANG = "fr";

function getByPath(obj, path) {
  return path.split(".").reduce((acc, k) => (acc && acc[k] != null ? acc[k] : undefined), obj);
}

function interpolate(str, params) {
  if (!params) return str;
  return String(str).replace(/\{(\w+)\}/g, (_, k) => (params[k] != null ? String(params[k]) : `{${k}}`));
}

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && DICTS[saved]) return saved;
    } catch {
    }
    return DEFAULT_LANG;
  });

  const applyDocument = useCallback((code) => {
    const meta = SUPPORTED_LANGS.find((l) => l.code === code) || SUPPORTED_LANGS[0];
    document.documentElement.lang = code;
    document.documentElement.dir = meta.dir;
    document.body.classList.toggle("lang-ar", code === "ar");
    document.body.classList.toggle("lang-fr", code === "fr");
    const title = getByPath(DICTS[code] || DICTS.fr, "app.title");
    if (title) document.title = title;
  }, []);

  useEffect(() => {
    applyDocument(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
    }
  }, [lang, applyDocument]);

  const setLang = useCallback((code) => {
    if (DICTS[code]) setLangState(code);
  }, []);

  const t = useCallback(
    (key, params) => {
      const dict = DICTS[lang] || DICTS.fr;
      let val = getByPath(dict, key);
      if (val == null) val = getByPath(DICTS.fr, key);
      if (val == null) return key;
      return interpolate(val, params);
    },
    [lang],
  );

  const dir = lang === "ar" ? "rtl" : "ltr";
  const isRTL = dir === "rtl";
  const locale = lang === "ar" ? "ar-MA" : "fr-FR";

  const value = useMemo(
    () => ({ lang, setLang, t, dir, isRTL, locale, langs: SUPPORTED_LANGS }),
    [lang, setLang, t, dir, isRTL, locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
