import { useI18n } from "../../i18n";

export function LanguageSwitcher({ compact = false }) {
  const { lang, setLang, langs, t } = useI18n();

  return (
    <div
      className={`flex items-center rounded-lg border border-gray-200 bg-gray-50 overflow-hidden ${
        compact ? "text-[11px]" : "text-xs"
      }`}
      role="group"
      aria-label={t("nav.language")}
    >
      {langs.map((item, index) => (
        <button
          key={item.code}
          type="button"
          onClick={() => setLang(item.code)}
          className={`px-2.5 py-1.5 font-semibold transition-colors whitespace-nowrap ${
            lang === item.code
              ? "bg-blue-600 text-white"
              : "text-gray-600 hover:bg-white"
          } ${index > 0 ? "border-s border-gray-200" : ""}`}
        >
          <span className="me-1">{item.flag}</span>
          {item.label}
        </button>
      ))}
    </div>
  );
}
