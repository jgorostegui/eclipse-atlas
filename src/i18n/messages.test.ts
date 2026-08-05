import { describe, expect, it } from "vitest";
import { messages, supportedLocales, translate } from "./messages";

describe("internationalisation catalog", () => {
  it("keeps the English and Spanish key sets identical", () => {
    const [first, ...rest] = supportedLocales;
    const expected = Object.keys(messages[first]).sort();
    rest.forEach((locale) => {
      expect(Object.keys(messages[locale]).sort()).toEqual(expected);
    });
  });

  it("interpolates values without changing scientific units", () => {
    expect(translate("en", "timeline.above", { altitude: "7.2" })).toBe(
      "7.2° apparent solar-centre altitude",
    );
    expect(translate("es", "timeline.above", { altitude: "7,2" })).toBe(
      "7,2° de altitud aparente del centro solar",
    );
  });

  it("distinguishes the terrain margin from the selected-time disc reading", () => {
    expect(translate("en", "horizon.primaryClearance")).toContain("terrain");
    expect(translate("en", "horizon.primaryClearance")).toContain("maximum");
    expect(translate("es", "horizon.primaryClearance")).toContain("relieve");
    expect(translate("es", "horizon.primaryClearance")).toContain("máximo");
    expect(translate("en", "horizon.marginNow", { margin: "+1.0" })).toContain(
      "Lower solar edge",
    );
    expect(translate("es", "horizon.marginNow", { margin: "+1,0" })).toContain(
      "Borde inferior",
    );
    expect(translate("en", "horizon.fully-clear")).toContain("solar disc");
    expect(translate("es", "horizon.fully-clear")).toContain("disco solar");
    expect(
      translate("es", "horizon.maximumVerdict", {
        verdict: "El relieve no tapa el disco solar",
      }),
    ).toBe("El relieve no tapa el disco solar");
    expect(
      translate("es", "horizon.discInset", {
        phase: translate("es", "horizon.phase.total"),
      }),
    ).toBe("Totalidad · ampliada");
  });

  it("keeps terrain provenance operational in both locales", () => {
    expect(
      translate("en", "metric.limitingTerrainValue", {
        azimuth: "282.5",
        distance: "11.0",
      }),
    ).toContain("azimuth 282.5°");
    expect(translate("en", "metric.terrainLimitsValue")).toContain(
      "vegetation",
    );
    expect(
      translate("es", "metric.limitingTerrainValue", {
        azimuth: "282,5",
        distance: "11,0",
      }),
    ).toContain("azimut 282,5°");
    expect(translate("es", "metric.terrainLimitsValue")).toContain(
      "vegetación",
    );
  });
});
