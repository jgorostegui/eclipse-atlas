import type { Page, Route } from "@playwright/test";
import { PNG } from "pngjs";

type TerrainFixtureMode = "structured" | "uniform" | "no-data";
type ForecastFixtureMode = "success" | "fail-once" | "null-event-hour";

export function deterministicForecastCloudCover(
  latitude: number,
  longitude: number,
) {
  const seed =
    Math.round((latitude + 90) * 1_000) * 37 +
    Math.round((longitude + 180) * 1_000) * 17;
  const first = Math.abs(seed) % 101;
  return [
    first,
    (first + 9) % 101,
    (first + 18) % 101,
    (first + 27) % 101,
  ] as const;
}

function createPngTile(
  size: number,
  pixel: readonly [red: number, green: number, blue: number, alpha: number],
) {
  const png = new PNG({ width: size, height: size });
  for (let offset = 0; offset < png.data.length; offset += 4) {
    png.data[offset] = pixel[0];
    png.data[offset + 1] = pixel[1];
    png.data[offset + 2] = pixel[2];
    png.data[offset + 3] = pixel[3];
  }
  return PNG.sync.write(png);
}

// TerrainRGB: -10,000 + encoded * 0.1 = 500 metres.
const VALID_TERRAIN_TILE = createPngTile(512, [1, 154, 40, 255]);
const NO_DATA_TERRAIN_TILE = createPngTile(512, [0, 0, 0, 0]);
const TRANSPARENT_MAP_TILE = createPngTile(1, [0, 0, 0, 0]);
const structuredTerrainTiles = new Map<string, Buffer>();

function terrainRgb(elevationMetres: number) {
  const encoded = Math.round((elevationMetres + 10_000) * 10);
  return [
    (encoded >> 16) & 255,
    (encoded >> 8) & 255,
    encoded & 255,
  ] as const;
}

function triangleWave(value: number, period: number) {
  const phase = ((value % period) + period) % period;
  return 1 - Math.abs(phase / (period / 2) - 1);
}

function createStructuredTerrainTile(tileX: number, tileY: number) {
  const key = `${tileX}/${tileY}`;
  const cached = structuredTerrainTiles.get(key);
  if (cached) return cached;

  const size = 512;
  const png = new PNG({ width: size, height: size });
  for (let pixelY = 0; pixelY < size; pixelY += 1) {
    for (let pixelX = 0; pixelX < size; pixelX += 1) {
      const globalX = tileX * size + pixelX;
      const globalY = tileY * size + pixelY;
      const elevationMetres =
        320 +
        260 * triangleWave(globalX + globalY * 2, 2_048) +
        110 * triangleWave(globalY - globalX, 4_096);
      const [red, green, blue] = terrainRgb(elevationMetres);
      const offset = (pixelY * size + pixelX) * 4;
      png.data[offset] = red;
      png.data[offset + 1] = green;
      png.data[offset + 2] = blue;
      png.data[offset + 3] = 255;
    }
  }
  const tile = PNG.sync.write(png);
  structuredTerrainTiles.set(key, tile);
  return tile;
}

// Every resolved coordinate maps to the same deterministic municipality so
// the AEMET municipal block renders stable content in UI journeys.
const DETERMINISTIC_REVERSE_GEOCODE = {
  id: "42.42173",
  province: "Soria",
  provinceCode: "42",
  muni: "Soria",
  muniCode: "42173",
  type: "municipio",
} as const;

// One deterministic forward-geocoder answer keeps place-name journeys stable
// for any typed query. The synthetic name avoids colliding with catalogue
// names asserted elsewhere, and the resolved coordinate is the same
// terrain-supported point the coordinate-search journey uses.
const DETERMINISTIC_GEOCODER_CANDIDATES = [
  {
    id: "700099001",
    province: "Provincia Fixture",
    provinceCode: "99",
    muni: "Municipio Fixture",
    muniCode: "99001",
    type: "poblacion",
    address: "Aldea Fixture, Aldea Fixture (Municipio Fixture)",
    poblacion: "Aldea Fixture",
    lat: 0.0,
    lng: 0.0,
    state: 0,
    countryCode: "011",
  },
] as const;

const DETERMINISTIC_GEOCODER_FIND = {
  id: "700099001",
  province: "Provincia Fixture",
  muni: "Municipio Fixture",
  type: "poblacion",
  address: "Aldea Fixture",
  poblacion: "Aldea Fixture",
  lat: 41.7636,
  lng: -2.4649,
  state: 0,
} as const;

const DETERMINISTIC_MUNICIPAL_FORECASTS = {
  date: "2026-08-12",
  "42173": {
    municipio: "Soria",
    estado_cielo: "Poco nuboso",
    precipitacion: "5",
    temperatura: { maxima: "31", minima: "14" },
  },
} as const;

export async function installDeterministicNetwork(
  page: Page,
  terrainMode: TerrainFixtureMode = "structured",
  forecastMode: ForecastFixtureMode = "success",
) {
  let forecastRequestCount = 0;
  await page.route(
    "https://api.open-meteo.com/data/ecmwf_ifs/static/meta.json",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          last_run_initialisation_time:
            Date.parse("2026-08-03T00:00:00.000Z") / 1_000,
          last_run_availability_time:
            Date.parse("2026-08-03T04:00:00.000Z") / 1_000,
          last_run_modification_time:
            Date.parse("2026-08-03T03:50:00.000Z") / 1_000,
          data_end_time: Date.parse("2026-08-15T00:00:00.000Z") / 1_000,
          temporal_resolution_seconds: 3_600,
          update_interval_seconds: 21_600,
        }),
      });
    },
  );
  const fulfillForecast = async (route: Route) => {
      forecastRequestCount += 1;
      if (forecastMode === "fail-once" && forecastRequestCount === 1) {
        await route.fulfill({ status: 503, body: "weather fixture unavailable" });
        return;
      }
      const url = new URL(route.request().url());
      const latitudes = (url.searchParams.get("latitude") ?? "").split(",");
      const longitudes = (url.searchParams.get("longitude") ?? "").split(",");
      if (latitudes.length !== longitudes.length || latitudes[0] === "") {
        throw new Error("Unexpected ECMWF fixture coordinates.");
      }
      const responses = latitudes.map((latitude, index) => {
        const [cloudAt17, cloudAt18, cloudAt19, cloudAt20] =
          deterministicForecastCloudCover(
            Number(latitude),
            Number(longitudes[index]),
          );
        const totalCloud =
          forecastMode === "null-event-hour"
            ? [cloudAt17, null, cloudAt19, cloudAt20]
            : [cloudAt17, cloudAt18, cloudAt19, cloudAt20];
        return {
          ...(index === 0 ? {} : { location_id: index }),
          latitude: Number(latitude),
          longitude: Number(longitudes[index]),
          elevation: 500,
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
            time: [
              "2026-08-12T17:00",
              "2026-08-12T18:00",
              "2026-08-12T19:00",
              "2026-08-12T20:00",
            ],
            cloud_cover: totalCloud,
            cloud_cover_low: [cloudAt17, cloudAt18, cloudAt19, cloudAt20].map(
              (value) => Math.min(100, value / 2),
            ),
            cloud_cover_mid: [cloudAt17, cloudAt18, cloudAt19, cloudAt20].map(
              (value) => Math.min(100, value / 3),
            ),
            cloud_cover_high: [cloudAt17, cloudAt18, cloudAt19, cloudAt20].map(
              (value) => Math.min(100, value / 4),
            ),
            precipitation: [0, 0, 0.1, 0],
            wind_speed_10m: [14, 12, 10, 9],
            wind_gusts_10m: [30, 28, 25, 22],
          },
        };
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(responses.length === 1 ? responses[0] : responses),
      });
    };
  await page.route(
    "https://single-runs-api.open-meteo.com/v1/forecast**",
    fulfillForecast,
  );
  await page.route(
    "https://api.open-meteo.com/v1/ecmwf**",
    fulfillForecast,
  );
  const supplementalCloudValues = {
    "/v1/gfs": [12, 18, 26, 33],
    "/v1/dwd-icon": [null, null, null, null],
    "/v1/gem": [28, 21, 14, 9],
  } as const;
  const fulfillSupplementalForecast = async (route: Route) => {
    const url = new URL(route.request().url());
    const modelPath = Object.keys(supplementalCloudValues).find((path) =>
      url.pathname.endsWith(path),
    ) as keyof typeof supplementalCloudValues | undefined;
    if (!modelPath) throw new Error("Unexpected supplemental forecast URL.");
    const latitude = Number(url.searchParams.get("latitude"));
    const longitude = Number(url.searchParams.get("longitude"));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        latitude,
        longitude,
        elevation: 500,
        timezone: "GMT",
        timezone_abbreviation: "GMT",
        utc_offset_seconds: 0,
        hourly_units: {
          time: "iso8601",
          cloud_cover: "%",
        },
        hourly: {
          time: [
            "2026-08-12T17:00",
            "2026-08-12T18:00",
            "2026-08-12T19:00",
            "2026-08-12T20:00",
          ],
          cloud_cover: supplementalCloudValues[modelPath],
        },
      }),
    });
  };
  await page.route(
    "https://api.open-meteo.com/v1/gfs**",
    fulfillSupplementalForecast,
  );
  await page.route(
    "https://api.open-meteo.com/v1/dwd-icon**",
    fulfillSupplementalForecast,
  );
  await page.route(
    "https://api.open-meteo.com/v1/gem**",
    fulfillSupplementalForecast,
  );
  await page.route("https://xyz-mdt.idee.es/**", async (route) => {
    const match = new URL(route.request().url()).pathname.match(
      /\/raster-dem\/\d+\/(\d+)\/(\d+)\.png$/,
    );
    if (!match) throw new Error("Unexpected TerrainRGB fixture URL.");
    const terrainTile =
      terrainMode === "no-data"
        ? NO_DATA_TERRAIN_TILE
        : terrainMode === "uniform"
          ? VALID_TERRAIN_TILE
          : createStructuredTerrainTile(Number(match[1]), Number(match[2]));
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      headers: { "content-length": String(terrainTile.byteLength) },
      body: terrainTile,
    });
  });
  await page.route("https://tile.openstreetmap.org/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: TRANSPARENT_MAP_TILE,
    });
  });
  await page.route("https://www.ign.es/wmts/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: TRANSPARENT_MAP_TILE,
    });
  });
  await page.route("https://tms-pnoa-ma.idee.es/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: TRANSPARENT_MAP_TILE,
    });
  });
  await page.route(
    "https://www.cartociudad.es/geocoder/api/geocoder/reverseGeocode**",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(DETERMINISTIC_REVERSE_GEOCODE),
      });
    },
  );
  await page.route(
    "https://www.cartociudad.es/geocoder/api/geocoder/candidates**",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(DETERMINISTIC_GEOCODER_CANDIDATES),
      });
    },
  );
  await page.route(
    "https://www.cartociudad.es/geocoder/api/geocoder/find**",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(DETERMINISTIC_GEOCODER_FIND),
      });
    },
  );
  await page.route(
    "https://www.ign.es/resources/cnig/weather.json",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "last-modified": "Sun, 09 Aug 2026 06:00:00 GMT" },
        body: JSON.stringify(DETERMINISTIC_MUNICIPAL_FORECASTS),
      });
    },
  );
}

export function collectBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}
