import { createContext } from "react";
import type { Locale, MessageKey, MessageValues } from "./messages";
import type { SpanishDisplayTimeZone } from "../domain/terrain-coverage";

export type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, values?: MessageValues) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatTime: (
    date: Date | null,
    timeZone: SpanishDisplayTimeZone,
  ) => string;
};

export const I18nContext = createContext<I18nContextValue | null>(null);
