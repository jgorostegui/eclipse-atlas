import { describe, expect, it } from "vitest";
import {
  municipalForecastByName,
  parseMunicipalForecastCatalog,
  parseMunicipalityFromReverseGeocode,
} from "./municipal-forecast";

const sampleDocument = {
  date: "2026-08-12",
  "09209": {
    municipio: "Medina de Pomar",
    estado_cielo: "Poco nuboso",
    precipitacion: "5",
    temperatura: { maxima: "37", minima: "18" },
  },
  "38023": {
    municipio: "San Cristóbal de La Laguna",
    estado_cielo: "Despejado",
    precipitacion: "0",
    temperatura: { maxima: "28", minima: "19" },
  },
};

describe("municipal forecast catalog", () => {
  it("indexes municipalities by INE code with the forecast date", () => {
    const updatedAt = new Date("2026-08-09T16:03:02.000Z");
    const catalog = parseMunicipalForecastCatalog(sampleDocument, updatedAt);
    expect(catalog.forecastDate).toBe("2026-08-12");
    expect(catalog.updatedAt).toBe(updatedAt);
    expect(catalog.byIneCode.size).toBe(2);
    const medina = catalog.byIneCode.get("09209");
    expect(medina?.municipalityName).toBe("Medina de Pomar");
    expect(medina?.skyStateSpanish).toBe("Poco nuboso");
    expect(medina?.precipitationProbabilityPercent).toBe(5);
    expect(medina?.temperatureMaximumCelsius).toBe(37);
    expect(medina?.temperatureMinimumCelsius).toBe(18);
  });

  it("keeps unparseable numeric fields as explicit unknowns", () => {
    const catalog = parseMunicipalForecastCatalog(
      {
        date: "2026-08-12",
        "09209": {
          municipio: "Medina de Pomar",
          estado_cielo: "Poco nuboso",
          precipitacion: "",
          temperatura: { maxima: "n/d", minima: "18" },
        },
      },
      null,
    );
    const medina = catalog.byIneCode.get("09209");
    expect(medina?.precipitationProbabilityPercent).toBeNull();
    expect(medina?.temperatureMaximumCelsius).toBeNull();
    expect(medina?.temperatureMinimumCelsius).toBe(18);
  });

  it("rejects a document without any municipality", () => {
    expect(() =>
      parseMunicipalForecastCatalog({ date: "2026-08-12" }, null),
    ).toThrow(/no municipalities/);
  });

  it("rejects a document without the forecast date", () => {
    expect(() =>
      parseMunicipalForecastCatalog(
        { "09209": sampleDocument["09209"] },
        null,
      ),
    ).toThrow();
  });
});

describe("municipality resolution from the reverse geocoder", () => {
  it("returns the municipality and its INE code", () => {
    expect(
      parseMunicipalityFromReverseGeocode({
        id: "07.09.G09_092090247791",
        province: "Burgos",
        muni: "Medina de Pomar",
        muniCode: "09209",
        type: "portal",
      }),
    ).toEqual({ ineCode: "09209", name: "Medina de Pomar" });
  });

  it("returns null when the payload carries no valid INE code", () => {
    expect(
      parseMunicipalityFromReverseGeocode({ muni: "Soria", muniCode: "42" }),
    ).toBeNull();
    expect(parseMunicipalityFromReverseGeocode({ muniCode: "42173" })).toBeNull();
    expect(parseMunicipalityFromReverseGeocode("not-an-object")).toBeNull();
  });
});

describe("municipal forecast by catalogued name", () => {
  const catalog = parseMunicipalForecastCatalog(sampleDocument, null);

  it("matches a name ignoring case and diacritics", () => {
    expect(
      municipalForecastByName(catalog, "san cristobal de la laguna")?.ineCode,
    ).toBe("38023");
  });

  it("returns null for unknown or ambiguous names", () => {
    expect(municipalForecastByName(catalog, "Villarriba")).toBeNull();
    const ambiguous = parseMunicipalForecastCatalog(
      {
        date: "2026-08-12",
        "09209": sampleDocument["09209"],
        "26999": { ...sampleDocument["09209"] },
      },
      null,
    );
    expect(municipalForecastByName(ambiguous, "Medina de Pomar")).toBeNull();
  });
});
