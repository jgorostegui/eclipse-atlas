import type { SpanishDisplayTimeZone } from "../domain/terrain-coverage";
import { translate, type Locale } from "./messages";

export function formatZonedTime(
  locale: Locale,
  date: Date | null,
  timeZone: SpanishDisplayTimeZone,
) {
  if (!date) return translate(locale, "state.notApplicable");
  return new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone,
    timeZoneName: "short",
  }).format(date);
}
