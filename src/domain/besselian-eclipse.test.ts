import { describe, expect, it } from "vitest";
import { EVENT_TIME_SCALE } from "./astronomy";
import {
  ECLIPSE_2026_BESSELIAN_ELEMENTS,
  ECLIPSE_2027_BESSELIAN_ELEMENTS,
  ECLIPSE_2028_BESSELIAN_ELEMENTS,
  calculateBesselianEclipseCircumstances,
} from "./besselian-eclipse";

describe("2026 Besselian eclipse circumstances", () => {
  it("keeps the published NASA coefficient table exact", () => {
    expect(ECLIPSE_2026_BESSELIAN_ELEMENTS.x).toEqual([
      0.47551399,
      0.51892489,
      -0.0000773,
      -0.00000804,
    ]);
    expect(ECLIPSE_2026_BESSELIAN_ELEMENTS.umbraRadius).toEqual([
      -0.008142,
      0.0000935,
      -0.0000121,
    ]);
  });

  it("derives the event Delta T from the frozen IERS terms", () => {
    expect(
      EVENT_TIME_SCALE.taiMinusUtcSeconds +
        EVENT_TIME_SCALE.ttMinusTaiSeconds -
        EVENT_TIME_SCALE.ut1MinusUtcSeconds,
    ).toBeCloseTo(EVENT_TIME_SCALE.deltaTSeconds, 8);
  });

  it("keeps the Burgos local-circumstances regression stable", () => {
    const result = calculateBesselianEclipseCircumstances(
      42.3439,
      -3.6969,
      596.4,
    );
    expect(result).not.toBeNull();
    if (!result) return;

    expect(result.kind).toBe("total");
    expect(result.partialBegin.toISOString()).toBe(
      "2026-08-12T17:32:22.497Z",
    );
    expect(result.totalBegin?.toISOString()).toBe(
      "2026-08-12T18:27:36.445Z",
    );
    expect(result.maximum.toISOString()).toBe(
      "2026-08-12T18:28:18.610Z",
    );
    expect(result.totalEnd?.toISOString()).toBe(
      "2026-08-12T18:29:00.573Z",
    );
    expect(result.partialEnd.toISOString()).toBe(
      "2026-08-12T19:20:48.183Z",
    );
    expect(result.totalityDurationSeconds).toBeCloseTo(84.1274, 3);
    expect(result.magnitude).toBeGreaterThan(1);
  });

  it("keeps central contacts absent outside the path of totality", () => {
    const result = calculateBesselianEclipseCircumstances(
      40.4168,
      -3.7038,
      667,
    );
    expect(result?.kind).toBe("partial");
    expect(result?.totalBegin).toBeNull();
    expect(result?.totalEnd).toBeNull();
    expect(result?.totalityDurationSeconds).toBeNull();
    expect(result?.obscuration).toBeGreaterThan(0.9);
    expect(result?.obscuration).toBeLessThan(1);
    expect(result?.magnitude).toBeGreaterThan(0.9);
    expect(result?.magnitude).toBeLessThan(1);
  });

  it("rejects non-finite and out-of-range observer inputs", () => {
    expect(() =>
      calculateBesselianEclipseCircumstances(91, 0, 0),
    ).toThrow(RangeError);
    expect(() =>
      calculateBesselianEclipseCircumstances(42, -3, Number.NaN),
    ).toThrow(RangeError);
  });
});

describe("2027 and 2028 Besselian eclipse circumstances", () => {
  it("keeps the published NASA coefficient tables exact", () => {
    expect(ECLIPSE_2027_BESSELIAN_ELEMENTS.x).toEqual([
      -0.019772,
      0.5447123,
      -0.0000446,
      -0.0000092,
    ]);
    expect(ECLIPSE_2027_BESSELIAN_ELEMENTS.umbraRadius).toEqual([
      -0.015464,
      0.0000137,
      -0.0000128,
    ]);
    expect(ECLIPSE_2028_BESSELIAN_ELEMENTS.x).toEqual([
      -0.205283,
      0.474257,
      -0.000039,
      -0.0000053,
    ]);
    expect(ECLIPSE_2028_BESSELIAN_ELEMENTS.umbraRadius).toEqual([
      0.02784,
      0.0000418,
      -0.0000099,
    ]);
  });

  it("matches the IGN published 2027 city-duration benchmarks", () => {
    const cadiz = calculateBesselianEclipseCircumstances(
      36.5298,
      -6.292,
      15,
      "2027",
    );
    const ceuta = calculateBesselianEclipseCircumstances(
      35.8894,
      -5.3213,
      25,
      "2027",
    );
    const malaga = calculateBesselianEclipseCircumstances(
      36.7213,
      -4.4214,
      15,
      "2027",
    );

    expect(cadiz?.kind).toBe("total");
    expect(ceuta?.kind).toBe("total");
    expect(malaga?.kind).toBe("total");
    expect(Math.abs((cadiz?.totalityDurationSeconds ?? 0) - 174)).toBeLessThan(3);
    expect(Math.abs((ceuta?.totalityDurationSeconds ?? 0) - 288)).toBeLessThan(3);
    expect(Math.abs((malaga?.totalityDurationSeconds ?? 0) - 108)).toBeLessThan(3);
  });

  it("reproduces the roughly seven-minute 2028 annularity in the published cities", () => {
    for (const [latitude, longitude, elevation] of [
      [37.3886, -5.9823, 11],
      [37.8882, -4.7794, 120],
      [39.4699, -0.3763, 15],
    ]) {
      const result = calculateBesselianEclipseCircumstances(
        latitude,
        longitude,
        elevation,
        "2028",
      );
      expect(result?.kind).toBe("annular");
      expect(result?.totalityDurationSeconds).toBeGreaterThan(6 * 60);
      expect(result?.totalityDurationSeconds).toBeLessThan(8 * 60);
      expect(result?.partialEnd.toISOString()).toMatch(
        /^2028-01-26T18:0[4567]:/,
      );
    }
  });
});
