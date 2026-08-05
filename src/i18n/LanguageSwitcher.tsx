import { useI18n } from "./useI18n";
import { supportedLocales } from "./messages";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className="language-switcher" role="group" aria-label={t("language.label")}>
      {supportedLocales.map((option) => (
        <button
          key={option}
          type="button"
          className={locale === option ? "is-active" : ""}
          aria-pressed={locale === option}
          lang={option}
          onClick={() => setLocale(option)}
        >
          {option.toLocaleUpperCase()}
        </button>
      ))}
    </div>
  );
}
