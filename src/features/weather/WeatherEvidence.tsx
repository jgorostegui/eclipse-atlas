import type { CloudClimatePoint } from "../../data/cloud-climate";
import type { EclipseCircumstances } from "../../domain/eclipse";
import type { SpanishDisplayTimeZone } from "../../domain/terrain-coverage";
import {
  ECMWF_IFS_MODEL_NAME,
  SUPPLEMENTAL_CLOUD_MODELS,
  type EclipseDayForecast,
  type ForecastRunMetadata,
  type SupplementalCloudForecast,
  type SupplementalCloudModelId,
} from "../../domain/weather";
import type { MessageKey, MessageValues } from "../../i18n/messages";

type Translate = (key: MessageKey, values?: MessageValues) => string;
type NumberFormatter = (
  value: number,
  options?: Intl.NumberFormatOptions,
) => string;

export type ForecastPresentation = Readonly<{
  run: ForecastRunMetadata;
  retrievedAt: Date;
  sourceMode: "exact-run" | "rolling-model";
}>;

export type SupplementalForecastState =
  | Readonly<{ status: "idle" | "loading" }>
  | Readonly<{
      status: "available";
      forecast: SupplementalCloudForecast;
    }>
  | Readonly<{
      status: "outside-horizon" | "error";
      retrievedAt: Date;
    }>;

export type SupplementalForecastStates = Readonly<
  Record<SupplementalCloudModelId, SupplementalForecastState>
>;

type ModelHour = Readonly<{
  validAt: Date;
  cloudCoverPercent: number;
}>;

type ModelRow = Readonly<{
  id: string;
  name: string;
  status: SupplementalForecastState["status"];
  hours: readonly ModelHour[] | null;
}>;

const FALLBACK_EVENT_HOURS = [17, 18, 19, 20].map(
  (hour) => new Date(`2026-08-12T${String(hour).padStart(2, "0")}:00:00.000Z`),
);

function formatUtcTimestamp(date: Date, locale: string) {
  return `${new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  }).format(date)} UTC`;
}

function formatForecastClock(
  date: Date,
  locale: string,
  timeZone: SpanishDisplayTimeZone | "UTC",
) {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(date);
}

function timeZoneAbbreviation(
  date: Date,
  locale: string,
  timeZone: SpanishDisplayTimeZone,
) {
  return (
    new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      timeZone,
      timeZoneName: "short",
    })
      .formatToParts(date)
      .find(({ type }) => type === "timeZoneName")?.value ?? timeZone
  );
}

function formatPercent(
  value: number,
  locale: string,
  formatNumber: NumberFormatter,
) {
  const number = formatNumber(value, { maximumFractionDigits: 0 });
  return locale.startsWith("es") ? `${number}\u00a0%` : `${number}%`;
}

function nearestHourIndex(hours: readonly ModelHour[], target: Date | null) {
  if (!target) return Math.min(1, hours.length - 1);
  return hours.reduce(
    (nearestIndex, current, index) =>
      Math.abs(current.validAt.getTime() - target.getTime()) <
      Math.abs(hours[nearestIndex].validAt.getTime() - target.getTime())
        ? index
        : nearestIndex,
    0,
  );
}

function modelRows(
  forecast: EclipseDayForecast | null,
  forecastStatus: "idle" | "loading" | "ready" | "error",
  supplementalForecasts: SupplementalForecastStates,
): readonly ModelRow[] {
  const ecmwfStatus = forecast
    ? "available"
    : forecastStatus === "loading"
      ? "loading"
      : forecastStatus === "error"
        ? "error"
        : forecastStatus === "ready"
          ? "outside-horizon"
          : "idle";
  return [
    {
      id: "ecmwf-ifs",
      name: ECMWF_IFS_MODEL_NAME,
      status: ecmwfStatus,
      hours: forecast?.hours ?? null,
    },
    ...SUPPLEMENTAL_CLOUD_MODELS.map((model) => {
      const state = supplementalForecasts[model.id];
      return {
        id: model.id,
        name: model.name,
        status: state.status,
        hours: state.status === "available" ? state.forecast.hours : null,
      };
    }),
  ];
}

function ModelStatus({ status, t }: { status: ModelRow["status"]; t: Translate }) {
  const key: MessageKey =
    status === "loading"
      ? "sky.models.loading"
      : status === "error"
        ? "sky.models.failed"
        : status === "outside-horizon"
          ? "sky.models.outsideHorizon"
          : "sky.models.pending";
  return <span className={`weather-model-status is-${status}`}>{t(key)}</span>;
}

function WeatherModelTable({
  rows,
  eclipse,
  displayTimeZone,
  locale,
  t,
  formatNumber,
}: {
  rows: readonly ModelRow[];
  eclipse: EclipseCircumstances | null;
  displayTimeZone: SpanishDisplayTimeZone;
  locale: string;
  t: Translate;
  formatNumber: NumberFormatter;
}) {
  const referenceHours =
    rows.find((row) => row.hours)?.hours?.map(({ validAt }) => validAt) ??
    FALLBACK_EVENT_HOURS;
  const maximumIndex = nearestHourIndex(
    referenceHours.map((validAt) => ({ validAt, cloudCoverPercent: 0 })),
    eclipse?.peak ?? null,
  );
  const zone = timeZoneAbbreviation(
    referenceHours[0],
    locale,
    displayTimeZone,
  );

  return (
    <div className="weather-model-table-wrap">
      <div className="weather-model-table-heading">
        <div>
          <h4>{t("sky.models.title")}</h4>
          <span>{t("sky.models.localTime", { zone })}</span>
        </div>
        {eclipse && (
          <p>
            {t("sky.models.maximum", {
              local: formatForecastClock(
                eclipse.peak,
                locale,
                displayTimeZone,
              ),
              zone,
              utc: formatForecastClock(eclipse.peak, locale, "UTC"),
            })}
          </p>
        )}
      </div>
      <table className="weather-model-table">
        <caption className="sr-only">{t("sky.models.tableLabel")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("sky.models.model")}</th>
            {referenceHours.map((hour, index) => (
              <th
                className={index === maximumIndex ? "is-near-maximum" : ""}
                key={hour.toISOString()}
                scope="col"
              >
                <time dateTime={hour.toISOString()}>
                  {formatForecastClock(hour, locale, displayTimeZone)}
                </time>
                {index === maximumIndex && (
                  <span
                    className="weather-model-table__maximum-marker"
                    aria-label={t("sky.models.nearestMaximum")}
                  >
                    ▲
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <th scope="row">{row.name}</th>
              {row.hours ? (
                row.hours.map((hour, index) => (
                  <td
                    className={index === maximumIndex ? "is-near-maximum" : ""}
                    key={hour.validAt.toISOString()}
                  >
                    {formatPercent(
                      hour.cloudCoverPercent,
                      locale,
                      formatNumber,
                    )}
                  </td>
                ))
              ) : (
                <td colSpan={4}>
                  <ModelStatus status={row.status} t={t} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ForecastDetails({
  forecast,
  eclipse,
  displayTimeZone,
  locale,
  t,
  formatNumber,
}: {
  forecast: EclipseDayForecast;
  eclipse: EclipseCircumstances | null;
  displayTimeZone: SpanishDisplayTimeZone;
  locale: string;
  t: Translate;
  formatNumber: NumberFormatter;
}) {
  const index = nearestHourIndex(forecast.hours, eclipse?.peak ?? null);
  const hour = forecast.hours[index];
  return (
    <section className="weather-nearest-hour" aria-label={t("sky.forecast.detailLabel")}>
      <div>
        <span>{t("sky.forecast.closestToMaximum")}</span>
        <b>
          {formatForecastClock(hour.validAt, locale, displayTimeZone)} · {" "}
          {formatForecastClock(hour.validAt, locale, "UTC")} UTC
        </b>
      </div>
      <dl>
        <div>
          <dt>{t("sky.forecast.layers")}</dt>
          <dd>
            {formatPercent(hour.lowCloudCoverPercent, locale, formatNumber)} / {" "}
            {formatPercent(hour.midCloudCoverPercent, locale, formatNumber)} / {" "}
            {formatPercent(hour.highCloudCoverPercent, locale, formatNumber)}
          </dd>
        </div>
        <div>
          <dt>{t("sky.forecast.precipitation")}</dt>
          <dd>
            {formatNumber(hour.precipitationMillimetres, {
              maximumFractionDigits: 1,
            })}
            &nbsp;mm
          </dd>
        </div>
        <div>
          <dt>{t("sky.forecast.windGust")}</dt>
          <dd>
            {formatNumber(hour.windSpeedKilometresPerHour, {
              maximumFractionDigits: 0,
            })}
            &nbsp;/&nbsp;
            {formatNumber(hour.windGustsKilometresPerHour, {
              maximumFractionDigits: 0,
            })}
            &nbsp;km/h
          </dd>
        </div>
      </dl>
    </section>
  );
}

function WeatherSummary({
  rows,
  eclipse,
  displayTimeZone,
  locale,
  t,
  formatNumber,
}: {
  rows: readonly ModelRow[];
  eclipse: EclipseCircumstances | null;
  displayTimeZone: SpanishDisplayTimeZone;
  locale: string;
  t: Translate;
  formatNumber: NumberFormatter;
}) {
  const available = rows.filter(
    (row): row is ModelRow & { hours: readonly ModelHour[] } =>
      row.hours !== null,
  );
  const values = available.map((row) => {
    const index = nearestHourIndex(row.hours, eclipse?.peak ?? null);
    return row.hours[index].cloudCoverPercent;
  });
  const referenceRow = available[0];
  const referenceHour = referenceRow
    ? referenceRow.hours[
        nearestHourIndex(referenceRow.hours, eclipse?.peak ?? null)
      ]
    : undefined;
  const zone = timeZoneAbbreviation(
    referenceHour?.validAt ?? FALLBACK_EVENT_HOURS[1],
    locale,
    displayTimeZone,
  );
  const loading = rows.some(({ status }) => status === "loading");

  return (
    <div className="weather-summary" aria-live="polite">
      <span className="weather-summary__icon" aria-hidden="true">
        <svg viewBox="0 0 32 32" focusable="false">
          <circle cx="10" cy="10" r="5" />
          <path d="M7.5 25.5h16a5 5 0 0 0 .4-10 7.5 7.5 0 0 0-14.4 2.4 3.8 3.8 0 0 0-2 .1 3.8 3.8 0 0 0 0 7.5Z" />
        </svg>
      </span>
      <div>
        <h3>{t("sky.title")}</h3>
        <p>
          {t(
            available.length === 1
              ? "sky.models.availableOne"
              : "sky.models.availableMany",
            { count: available.length, total: rows.length },
          )}
        </p>
      </div>
      <strong>
        {values.length > 0 && referenceHour
          ? t("sky.models.range", {
              low: formatNumber(Math.min(...values), {
                maximumFractionDigits: 0,
              }),
              high: formatNumber(Math.max(...values), {
                maximumFractionDigits: 0,
              }),
              time: formatForecastClock(
                referenceHour.validAt,
                locale,
                displayTimeZone,
              ),
              zone,
            })
          : loading
            ? t("sky.models.loading")
            : t("sky.models.none")}
      </strong>
    </div>
  );
}

export function SkyEvidence({
  locationName,
  aemetMunicipality,
  aemetUrl,
  climate,
  climateStatus,
  forecast,
  forecastStatus,
  forecastPresentation,
  supplementalForecasts,
  eclipse,
  displayTimeZone,
  onRetryClimate,
  onRetryForecast,
  locale,
  t,
  formatNumber,
}: {
  locationName: string;
  aemetMunicipality: string | null;
  aemetUrl: string;
  climate: CloudClimatePoint | null;
  climateStatus: "loading" | "ready" | "error";
  forecast: EclipseDayForecast | null;
  forecastStatus: "idle" | "loading" | "ready" | "error";
  forecastPresentation: ForecastPresentation | null;
  supplementalForecasts: SupplementalForecastStates;
  eclipse: EclipseCircumstances | null;
  displayTimeZone: SpanishDisplayTimeZone;
  onRetryClimate: () => void;
  onRetryForecast: () => void;
  locale: string;
  t: Translate;
  formatNumber: NumberFormatter;
}) {
  const rows = modelRows(forecast, forecastStatus, supplementalForecasts);
  const supplementalAvailable = Object.values(supplementalForecasts).filter(
    (
      state,
    ): state is Extract<SupplementalForecastState, { status: "available" }> =>
      state.status === "available",
  );
  const latestSupplementalRetrieval = supplementalAvailable
    .map(({ forecast: item }) => item.retrievedAt)
    .sort((left, right) => right.getTime() - left.getTime())[0];

  return (
    <section
      className="sky-evidence"
      aria-labelledby="sky-evidence-title"
      data-location={locationName}
    >
      <WeatherSummary
        rows={rows}
        eclipse={eclipse}
        displayTimeZone={displayTimeZone}
        locale={locale}
        t={t}
        formatNumber={formatNumber}
      />
      <div className="sky-evidence__expanded">
        <h3 className="sr-only" id="sky-evidence-title">
          {t("sky.title")}
        </h3>
        <WeatherModelTable
          rows={rows}
          eclipse={eclipse}
          displayTimeZone={displayTimeZone}
          locale={locale}
          t={t}
          formatNumber={formatNumber}
        />
        {forecast && (
          <ForecastDetails
            forecast={forecast}
            eclipse={eclipse}
            displayTimeZone={displayTimeZone}
            locale={locale}
            t={t}
            formatNumber={formatNumber}
          />
        )}
        <div className="weather-climate" aria-busy={climateStatus === "loading"}>
          <span>{t("sky.climate.title")}</span>
          {climate ? (
            <div>
              <strong>
                {t("sky.cloudMean", {
                  percent: formatNumber(climate.meanCloudCoverPercent, {
                    maximumFractionDigits: 0,
                  }),
                })}
              </strong>
              <small>
                {t("sky.climate.range", {
                  low: formatNumber(climate.percentile25CloudCoverPercent, {
                    maximumFractionDigits: 0,
                  }),
                  high: formatNumber(climate.percentile75CloudCoverPercent, {
                    maximumFractionDigits: 0,
                  }),
                })}
              </small>
              <small>{t("sky.climate.source")}</small>
            </div>
          ) : (
            <div>
              <strong>
                {climateStatus === "loading"
                  ? t("sky.climate.loading")
                  : climateStatus === "error"
                    ? t("sky.climate.error")
                    : t("sky.climate.unavailable")}
              </strong>
              {climateStatus === "error" && (
                <button type="button" onClick={onRetryClimate}>
                  {t("sky.retry")}
                </button>
              )}
            </div>
          )}
        </div>
        <a
          className="weather-aemet-link"
          href={aemetUrl}
          target="_blank"
          rel="noreferrer"
        >
          {aemetMunicipality
            ? t("sky.aemetPlace", { municipality: aemetMunicipality })
            : t("sky.aemetSearch")}
          <span aria-hidden="true">↗</span>
        </a>
        {(forecastPresentation || latestSupplementalRetrieval) && (
          <div className="weather-provenance">
            {forecastPresentation && (
              <p>
                {t(
                  forecastPresentation.sourceMode === "exact-run"
                    ? "sky.forecast.exactProvenance"
                    : "sky.forecast.rollingProvenance",
                  {
                    run: formatUtcTimestamp(
                      forecastPresentation.run.initializedAt,
                      locale,
                    ),
                    retrieved: formatUtcTimestamp(
                      forecastPresentation.retrievedAt,
                      locale,
                    ),
                  },
                )}
              </p>
            )}
            {latestSupplementalRetrieval && (
              <p>
                {t("sky.models.rollingProvenance", {
                  retrieved: formatUtcTimestamp(
                    latestSupplementalRetrieval,
                    locale,
                  ),
                })}
              </p>
            )}
          </div>
        )}
        {(forecastStatus === "error" ||
          Object.values(supplementalForecasts).some(
            ({ status }) => status === "error",
          )) && (
          <button
            className="sky-evidence__retry"
            type="button"
            onClick={onRetryForecast}
          >
            {t("sky.retry")}
          </button>
        )}
      </div>
    </section>
  );
}
