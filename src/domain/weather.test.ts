import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchEclipseDayForecast,
  fetchEcmwfRunMetadata,
  fetchSupplementalCloudForecast,
  type ForecastRunMetadata,
} from "./weather";

afterEach(() => {
  vi.useRealTimers();
});

const RUN: ForecastRunMetadata = {
  initializedAt: new Date("2026-08-03T00:00:00.000Z"),
  availableAt: new Date("2026-08-03T04:00:00.000Z"),
  dataEndsAt: new Date("2026-08-15T00:00:00.000Z"),
};

const LIMITED_RUN: ForecastRunMetadata = {
  ...RUN,
  dataEndsAt: new Date("2026-08-09T23:00:00.000Z"),
};

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function forecastResponse(times: string[], cloudCover: Array<number | null>) {
  const copy = (values: Array<number | null>) => [...values];
  return {
    latitude: 41.75,
    longitude: -2.5,
    elevation: 1_020,
    timezone: "GMT",
    timezone_abbreviation: "GMT",
    utc_offset_seconds: 0,
    hourly_units: {
      time: "iso8601",
      cloud_cover: "%",
      cloud_cover_low: "%",
      cloud_cover_mid: "%",
      cloud_cover_high: "%",
      precipitation: "mm",
      wind_speed_10m: "km/h",
      wind_gusts_10m: "km/h",
    },
    hourly: {
      time: times,
      cloud_cover: cloudCover,
      cloud_cover_low: copy(cloudCover),
      cloud_cover_mid: copy(cloudCover),
      cloud_cover_high: copy(cloudCover),
      precipitation: cloudCover.map(() => 0.2),
      wind_speed_10m: cloudCover.map(() => 12),
      wind_gusts_10m: cloudCover.map(() => 28),
    },
  };
}

function cloudOnlyForecastResponse(
  times: string[],
  cloudCover: Array<number | null>,
) {
  return {
    latitude: 41.75,
    longitude: -2.5,
    elevation: 1_020,
    timezone: "GMT",
    timezone_abbreviation: "GMT",
    utc_offset_seconds: 0,
    hourly_units: {
      time: "iso8601",
      cloud_cover: "%",
    },
    hourly: {
      time: times,
      cloud_cover: cloudCover,
    },
  };
}

describe("ECMWF eclipse-day forecast", () => {
  it("parses run initialization separately from availability", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        last_run_initialisation_time: Date.parse("2026-08-03T00:00:00Z") / 1_000,
        last_run_availability_time: Date.parse("2026-08-03T04:00:00Z") / 1_000,
        last_run_modification_time: Date.parse("2026-08-03T03:50:00Z") / 1_000,
        data_end_time: Date.parse("2026-08-09T23:00:00Z") / 1_000,
        temporal_resolution_seconds: 3_600,
        update_interval_seconds: 21_600,
      }),
    );

    const metadata = await fetchEcmwfRunMetadata(
      new AbortController().signal,
      fetchMock,
    );

    expect(metadata.initializedAt.toISOString()).toBe("2026-08-03T00:00:00.000Z");
    expect(metadata.availableAt.toISOString()).toBe("2026-08-03T04:00:00.000Z");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses an exact run when the full eclipse forecast window is present", async () => {
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      expect(String(input)).toContain("run=2026-08-03T00%3A00");
      return jsonResponse(
        forecastResponse(
          [
            "2026-08-12T17:00",
            "2026-08-12T18:00",
            "2026-08-12T19:00",
            "2026-08-12T20:00",
          ],
          [28, 22, 35, 41],
        ),
      );
    });

    const batch = await fetchEclipseDayForecast(
      [{ id: "soria", latitude: 41.764, longitude: -2.469 }],
      new AbortController().signal,
      {
        run: RUN,
        fetch: fetchMock,
        now: () => new Date("2026-08-03T05:00:00.000Z"),
      },
    );

    expect(batch.sourceMode).toBe("exact-run");
    expect(batch.retrievedAt.toISOString()).toBe("2026-08-03T05:00:00.000Z");
    expect(batch.forecasts[0]?.hours.map((hour) => hour.cloudCoverPercent)).toEqual([
      28, 22, 35, 41,
    ]);
    expect(batch.forecasts[0]?.serviceCoordinate).toEqual({
      latitude: 41.75,
      longitude: -2.5,
      downscalingElevationMetres: 1_020,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back explicitly to the rolling model delivery outside exact-run coverage", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          forecastResponse(
            [
              "2026-08-12T17:00",
              "2026-08-12T18:00",
              "2026-08-12T19:00",
              "2026-08-12T20:00",
            ],
            [16, 12, 18, 24],
          ),
        ),
      );

    const batch = await fetchEclipseDayForecast(
      [{ id: "soria", latitude: 41.764, longitude: -2.469 }],
      new AbortController().signal,
      { run: LIMITED_RUN, fetch: fetchMock },
    );

    expect(batch.sourceMode).toBe("rolling-model");
    expect(batch.forecasts[0]?.hours[1].cloudCoverPercent).toBe(12);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("start_date=2026-08-12");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to rolling delivery when the exact-run endpoint is unavailable", async () => {
    const rollingResponse = forecastResponse(
      [
        "2026-08-12T17:00",
        "2026-08-12T18:00",
        "2026-08-12T19:00",
        "2026-08-12T20:00",
      ],
      [16, 12, 18, 24],
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: true }, 503))
      .mockResolvedValueOnce(jsonResponse(rollingResponse));

    const batch = await fetchEclipseDayForecast(
      [{ id: "soria", latitude: 41.764, longitude: -2.469 }],
      new AbortController().signal,
      { run: RUN, fetch: fetchMock },
    );

    expect(batch.sourceMode).toBe("rolling-model");
    expect(batch.forecasts[0]?.hours[1].cloudCoverPercent).toBe(12);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/v1/ecmwf");
  });

  it("falls back when an exact run returns a successful but invalid payload", async () => {
    const rollingResponse = forecastResponse(
      [
        "2026-08-12T17:00",
        "2026-08-12T18:00",
        "2026-08-12T19:00",
        "2026-08-12T20:00",
      ],
      [9, 12, 15, 18],
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ unexpected: true }))
      .mockResolvedValueOnce(jsonResponse(rollingResponse));

    const batch = await fetchEclipseDayForecast(
      [{ id: "soria", latitude: 41.764, longitude: -2.469 }],
      new AbortController().signal,
      { run: RUN, fetch: fetchMock },
    );

    expect(batch.sourceMode).toBe("rolling-model");
    expect(batch.forecasts[0]?.hours[1].cloudCoverPercent).toBe(12);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("times out a stalled exact request and continues with rolling delivery", async () => {
    vi.useFakeTimers();
    const rollingResponse = forecastResponse(
      [
        "2026-08-12T17:00",
        "2026-08-12T18:00",
        "2026-08-12T19:00",
        "2026-08-12T20:00",
      ],
      [20, 18, 16, 14],
    );
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        (_input: URL | RequestInfo, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          }),
      )
      .mockResolvedValueOnce(jsonResponse(rollingResponse));

    const request = fetchEclipseDayForecast(
      [{ id: "soria", latitude: 41.764, longitude: -2.469 }],
      new AbortController().signal,
      {
        run: RUN,
        fetch: fetchMock,
        requestTimeoutMilliseconds: 10,
      },
    );
    await vi.advanceTimersByTimeAsync(11);
    const batch = await request;

    expect(batch.sourceMode).toBe("rolling-model");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("bounds a stalled metadata request", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_input: URL | RequestInfo, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );
    const request = fetchEcmwfRunMetadata(
      new AbortController().signal,
      fetchMock,
      10,
    );
    const rejection = expect(request).rejects.toThrow("timed out");

    await vi.advanceTimersByTimeAsync(11);
    await rejection;
  });

  it("associates reordered batch responses by location identifier", async () => {
    const barcelona = {
      ...forecastResponse(
        [
          "2026-08-12T17:00",
          "2026-08-12T18:00",
          "2026-08-12T19:00",
          "2026-08-12T20:00",
        ],
        [90, 90, 90, 90],
      ),
      location_id: 1,
      latitude: 41.4,
      longitude: 2.2,
    };
    const seville = {
      ...forecastResponse(
        [
          "2026-08-12T17:00",
          "2026-08-12T18:00",
          "2026-08-12T19:00",
          "2026-08-12T20:00",
        ],
        [10, 10, 10, 10],
      ),
      latitude: 37.4,
      longitude: -6,
    };
    const fetchMock = vi.fn(async () => jsonResponse([barcelona, seville]));

    const batch = await fetchEclipseDayForecast(
      [
        { id: "seville", latitude: 37.39, longitude: -5.99 },
        { id: "barcelona", latitude: 41.38, longitude: 2.17 },
      ],
      new AbortController().signal,
      { run: RUN, fetch: fetchMock },
    );

    expect(batch.forecasts[0]?.locationId).toBe("seville");
    expect(batch.forecasts[0]?.hours[0].cloudCoverPercent).toBe(10);
    expect(batch.forecasts[0]?.serviceCoordinate.latitude).toBe(37.4);
    expect(batch.forecasts[1]?.locationId).toBe("barcelona");
    expect(batch.forecasts[1]?.hours[0].cloudCoverPercent).toBe(90);
  });

  it("rejects incomplete or duplicated batch location identifiers", async () => {
    const response = {
      ...forecastResponse(
        [
          "2026-08-12T17:00",
          "2026-08-12T18:00",
          "2026-08-12T19:00",
          "2026-08-12T20:00",
        ],
        [10, 10, 10, 10],
      ),
      location_id: 1,
    };
    const fetchMock = vi.fn(async () => jsonResponse([response, response]));

    await expect(
      fetchEclipseDayForecast(
        [
          { id: "seville", latitude: 37.39, longitude: -5.99 },
          { id: "barcelona", latitude: 41.38, longitude: 2.17 },
        ],
        new AbortController().signal,
        { run: RUN, fetch: fetchMock },
      ),
    ).rejects.toThrow("location identifiers");
  });

  it("rejects impossible precipitation, wind and gust values", async () => {
    const variables = [
      "precipitation",
      "wind_speed_10m",
      "wind_gusts_10m",
    ] as const;
    for (const variable of variables) {
      const response = forecastResponse(
        [
          "2026-08-12T17:00",
          "2026-08-12T18:00",
          "2026-08-12T19:00",
          "2026-08-12T20:00",
        ],
        [10, 10, 10, 10],
      );
      response.hourly[variable][0] = Number.MAX_VALUE;
      const fetchMock = vi.fn(async () => jsonResponse(response));

      await expect(
        fetchEclipseDayForecast(
          [{ id: "soria", latitude: 41.764, longitude: -2.469 }],
          new AbortController().signal,
          { run: RUN, fetch: fetchMock },
        ),
      ).rejects.toThrow();
    }
  });

  it.each([
    [
      "duplicated",
      [
        "2026-08-12T17:00",
        "2026-08-12T18:00",
        "2026-08-12T18:00",
        "2026-08-12T19:00",
        "2026-08-12T20:00",
      ],
    ],
    [
      "unsorted",
      [
        "2026-08-12T18:00",
        "2026-08-12T17:00",
        "2026-08-12T19:00",
        "2026-08-12T20:00",
      ],
    ],
  ])("rejects %s hourly timestamps", async (_label, times) => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(forecastResponse(times, times.map(() => 10))),
    );

    await expect(
      fetchEclipseDayForecast(
        [{ id: "soria", latitude: 41.764, longitude: -2.469 }],
        new AbortController().signal,
        { run: RUN, fetch: fetchMock },
      ),
    ).rejects.toThrow(/duplicated or unsorted/i);
  });

  it("keeps missing atmospheric values unknown instead of converting them to zero", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        forecastResponse(
          [
            "2026-08-12T17:00",
            "2026-08-12T18:00",
            "2026-08-12T19:00",
            "2026-08-12T20:00",
          ],
          [12, null, 18, 24],
        ),
      ),
    );

    const batch = await fetchEclipseDayForecast(
      [{ id: "soria", latitude: 41.764, longitude: -2.469 }],
      new AbortController().signal,
      { run: RUN, fetch: fetchMock },
    );

    expect(batch.forecasts).toEqual([null]);
  });

  it("rejects rate limits and malformed array alignment", async () => {
    const rateLimited = vi.fn(async () => jsonResponse({ error: true }, 429));
    await expect(
      fetchEclipseDayForecast(
        [{ id: "soria", latitude: 41.764, longitude: -2.469 }],
        new AbortController().signal,
        { run: RUN, fetch: rateLimited },
      ),
    ).rejects.toThrow("HTTP 429");

    const malformed = forecastResponse(
      [
        "2026-08-12T17:00",
        "2026-08-12T18:00",
        "2026-08-12T19:00",
        "2026-08-12T20:00",
      ],
      [18, 20, 30, 24],
    );
    malformed.hourly.wind_gusts_10m.pop();
    const malformedFetch = vi.fn(async () => jsonResponse(malformed));
    await expect(
      fetchEclipseDayForecast(
        [{ id: "soria", latitude: 41.764, longitude: -2.469 }],
        new AbortController().signal,
        { run: RUN, fetch: malformedFetch },
      ),
    ).rejects.toThrow("misaligned hourly arrays");
  });
});

describe("supplemental deterministic cloud forecasts", () => {
  const eventHours = [
    "2026-08-12T17:00",
    "2026-08-12T18:00",
    "2026-08-12T19:00",
    "2026-08-12T20:00",
  ];

  it("requests and identifies one provider model explicitly", async () => {
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/v1/gfs");
      expect(url.searchParams.get("models")).toBe("gfs_seamless");
      expect(url.searchParams.get("start_date")).toBe("2026-08-12");
      return jsonResponse(cloudOnlyForecastResponse(eventHours, [5, 13, 24, 40]));
    });

    const forecast = await fetchSupplementalCloudForecast(
      "noaa-gfs",
      { id: "soria", latitude: 41.764, longitude: -2.469 },
      new AbortController().signal,
      {
        fetch: fetchMock,
        now: () => new Date("2026-08-04T17:00:00.000Z"),
      },
    );

    expect(forecast?.modelName).toBe("NOAA GFS");
    expect(forecast?.hours.map((hour) => hour.cloudCoverPercent)).toEqual([
      5, 13, 24, 40,
    ]);
    expect(forecast?.retrievedAt.toISOString()).toBe(
      "2026-08-04T17:00:00.000Z",
    );
  });

  it("reports an unavailable event window as null rather than zero", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        cloudOnlyForecastResponse(eventHours, [4, null, null, null]),
      ),
    );

    const forecast = await fetchSupplementalCloudForecast(
      "dwd-icon",
      { id: "soria", latitude: 41.764, longitude: -2.469 },
      new AbortController().signal,
      { fetch: fetchMock },
    );

    expect(forecast).toBeNull();
  });

  it("rejects malformed units without affecting other model requests", async () => {
    const response = cloudOnlyForecastResponse(eventHours, [0, 0, 0, 0]);
    response.hourly_units.cloud_cover = "fraction";

    await expect(
      fetchSupplementalCloudForecast(
        "eccc-gem",
        { id: "soria", latitude: 41.764, longitude: -2.469 },
        new AbortController().signal,
        { fetch: async () => jsonResponse(response) },
      ),
    ).rejects.toThrow();
  });
});
