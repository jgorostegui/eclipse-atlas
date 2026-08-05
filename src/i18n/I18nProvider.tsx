import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  supportedLocales,
  translate,
  type Locale,
  type MessageKey,
  type MessageValues,
} from "./messages";
import { I18nContext } from "./I18nContext";
import type { SpanishDisplayTimeZone } from "../domain/terrain-coverage";
import { formatZonedTime } from "./formatters";

const STORAGE_KEY = "eclipse-atlas-locale";

function isLocale(value: string | null): value is Locale {
  return supportedLocales.some((locale) => locale === value);
}

function readStoredLocale() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeLocale(locale: Locale) {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Storage can be disabled by browser privacy settings. The URL remains canonical.
  }
}

function initialLocale(): Locale {
  const queryLocale = new URLSearchParams(window.location.search).get("lang");
  if (isLocale(queryLocale)) return queryLocale;

  const storedLocale = readStoredLocale();
  if (isLocale(storedLocale)) return storedLocale;

  return window.navigator.language.toLocaleLowerCase().startsWith("es")
    ? "es"
    : "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
    const url = new URL(window.location.href);
    url.searchParams.set("lang", nextLocale);
    window.history.replaceState(window.history.state, "", url);
    storeLocale(nextLocale);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    let active = true;
    const restoreLocaleFromHistory = () => {
      queueMicrotask(() => {
        if (!active) return;
        const queryLocale = new URLSearchParams(window.location.search).get(
          "lang",
        );
        if (isLocale(queryLocale)) {
          setLocaleState(queryLocale);
          storeLocale(queryLocale);
        }
      });
    };
    window.addEventListener("popstate", restoreLocaleFromHistory);
    return () => {
      active = false;
      window.removeEventListener("popstate", restoreLocaleFromHistory);
    };
  }, []);

  const t = useCallback(
    (key: MessageKey, values?: MessageValues) =>
      translate(locale, key, values),
    [locale],
  );
  const formatNumber = useCallback(
    (value: number, options?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(locale === "es" ? "es-ES" : "en-GB", options).format(
        value,
      ),
    [locale],
  );
  const formatTime = useCallback(
    (date: Date | null, timeZone: SpanishDisplayTimeZone) =>
      formatZonedTime(locale, date, timeZone),
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t, formatNumber, formatTime }),
    [formatNumber, formatTime, locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
