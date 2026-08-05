import { describe, expect, it } from "vitest";
import {
  calculateEclipseAnimationTrack,
  calculateEclipseAnimationWindowTrack,
  calculateEclipseCircumstances,
  formatDuration,
  interpolateEclipseAnimationSample,
  isSolarCentreAboveApparentHorizon,
} from "./eclipse";
import { PLANNING_VIEWPOINT_HEIGHT_METRES } from "./observer";

const elevation = (groundElevationMetres: number) => ({
  groundElevationMetres,
  viewpointHeightAboveGroundMetres: PLANNING_VIEWPOINT_HEIGHT_METRES,
});

const BURGOS_VALIDATION_POINT = {
  latitude: 42.3439,
  longitude: -3.6969,
  groundElevationMetres: 858.1,
} as const;

describe("calculateEclipseCircumstances", () => {
  it("calculates the later Spanish eclipses through the same point workflow", () => {
    const ceuta2027 = calculateEclipseCircumstances(
      35.8894,
      -5.3213,
      elevation(25),
      "2027",
    );
    const sevilla2028 = calculateEclipseCircumstances(
      37.3886,
      -5.9823,
      elevation(11),
      "2028",
    );

    expect(ceuta2027?.eventId).toBe("2027");
    expect(ceuta2027?.kind).toBe("total");
    expect(ceuta2027?.totalityDurationSeconds).toBeCloseTo(288.2, 0);
    expect(ceuta2027?.contacts.c2?.aboveApparentHorizon).toBe(true);
    expect(ceuta2027?.contacts.c3?.aboveApparentHorizon).toBe(true);

    expect(sevilla2028?.eventId).toBe("2028");
    expect(sevilla2028?.kind).toBe("annular");
    expect(sevilla2028?.totalityDurationSeconds).toBeCloseTo(435.2, 0);
    expect(sevilla2028?.contacts.c2?.aboveApparentHorizon).toBe(true);
    expect(sevilla2028?.contacts.c3?.aboveApparentHorizon).toBe(true);
    expect(sevilla2028?.sunAltitudeDegrees).toBeGreaterThan(0);
  });
  it("calculates the target eclipse across public geographic references", () => {
    const aCoruna = calculateEclipseCircumstances(
      43.3623,
      -8.4115,
      elevation(21),
    );
    const burgos = calculateEclipseCircumstances(
      BURGOS_VALIDATION_POINT.latitude,
      BURGOS_VALIDATION_POINT.longitude,
      elevation(BURGOS_VALIDATION_POINT.groundElevationMetres),
    );
    const soria = calculateEclipseCircumstances(
      41.7636,
      -2.4649,
      elevation(1063),
    );

    expect(aCoruna?.kind).toBe("total");
    expect(burgos?.kind).toBe("total");
    expect(soria?.kind).toBe("total");
    expect(burgos?.totalityDurationSeconds).toBeCloseTo(103.568, 2);
    for (const result of [aCoruna, burgos, soria]) {
      expect(result?.contacts.c2?.aboveApparentHorizon).toBe(true);
      expect(result?.contacts.c3?.aboveApparentHorizon).toBe(true);
    }
    expect(aCoruna?.contacts.c4.aboveApparentHorizon).toBe(true);
    expect(aCoruna?.contacts.c4.apparentSolarCentreAltitudeDegrees).toBeGreaterThan(0);
    for (const result of [burgos, soria]) {
      expect(result?.contacts.c4.aboveApparentHorizon).toBe(false);
      expect(
        result?.contacts.c4.apparentSolarCentreAltitudeDegrees,
      ).toBeLessThan(0);
    }
  });

  it("classifies apparent-horizon contacts before display rounding", () => {
    expect(isSolarCentreAboveApparentHorizon(0.004)).toBe(true);
    expect(isSolarCentreAboveApparentHorizon(-0.004)).toBe(false);
    expect(isSolarCentreAboveApparentHorizon(0)).toBe(false);
  });

  it("rejects invalid coordinates instead of coercing them", () => {
    expect(() => calculateEclipseCircumstances(91, 0, elevation(0))).toThrow(
      RangeError,
    );
    expect(() =>
      calculateEclipseCircumstances(42, Number.NaN, elevation(0)),
    ).toThrow(RangeError);
  });

  it("uses an explicit planning viewpoint height and solar angular radius", () => {
    const result = calculateEclipseCircumstances(
      BURGOS_VALIDATION_POINT.latitude,
      BURGOS_VALIDATION_POINT.longitude,
      elevation(BURGOS_VALIDATION_POINT.groundElevationMetres),
    );

    expect(result?.groundElevationMetres).toBe(858.1);
    expect(result?.viewpointHeightAboveGroundMetres).toBe(1.5);
    expect(result?.observerElevationMetres).toBe(859.6);
    expect(result?.solarAngularRadiusDegrees).toBeCloseTo(0.262958, 5);
    expect(result?.magnitude).toBeGreaterThan(1);
    expect(result?.idealHorizonSunset?.toISOString()).toMatch(
      /^2026-08-12T19:/,
    );
    expect(
      (result?.partialEnd.getTime() ?? 0) -
        (result?.idealHorizonSunset?.getTime() ?? 0),
    ).toBeGreaterThan(0);
  });

  it("builds a topocentric Sun and Moon track without recalculating the eclipse", () => {
    const result = calculateEclipseCircumstances(
      BURGOS_VALIDATION_POINT.latitude,
      BURGOS_VALIDATION_POINT.longitude,
      elevation(BURGOS_VALIDATION_POINT.groundElevationMetres),
    );
    expect(result).not.toBeNull();
    if (!result) return;

    const track = calculateEclipseAnimationTrack(
      BURGOS_VALIDATION_POINT.latitude,
      BURGOS_VALIDATION_POINT.longitude,
      result,
      61,
    );
    expect(track).toHaveLength(61);
    expect(track[0].time).toEqual(result.partialBegin);
    expect(track.at(-1)?.time).toEqual(result.partialEnd);
    expect(track.every((sample) => sample.sunAngularRadiusDegrees > 0)).toBe(
      true,
    );
    expect(track.every((sample) => sample.moonAngularRadiusDegrees > 0)).toBe(
      true,
    );

    const nearestPeak = track.reduce((nearest, sample) =>
      Math.abs(sample.time.getTime() - result.peak.getTime()) <
      Math.abs(nearest.time.getTime() - result.peak.getTime())
        ? sample
        : nearest,
    );
    expect(nearestPeak.sunAltitudeDegrees).toBeCloseTo(
      result.sunAltitudeDegrees,
      1,
    );

    const peakFraction =
      (result.peak.getTime() - result.partialBegin.getTime()) /
      (result.partialEnd.getTime() - result.partialBegin.getTime());
    const interpolatedPeak = interpolateEclipseAnimationSample(
      track,
      peakFraction,
    );
    expect(interpolatedPeak.time).toEqual(result.peak);
    expect(interpolatedPeak.sunAltitudeDegrees).toBeCloseTo(
      result.sunAltitudeDegrees,
      3,
    );
  });

  it("rejects unreasonable animation sample counts", () => {
    const result = calculateEclipseCircumstances(
      BURGOS_VALIDATION_POINT.latitude,
      BURGOS_VALIDATION_POINT.longitude,
      elevation(BURGOS_VALIDATION_POINT.groundElevationMetres),
    );
    expect(result).not.toBeNull();
    if (!result) return;
    expect(() =>
      calculateEclipseAnimationTrack(
        BURGOS_VALIDATION_POINT.latitude,
        BURGOS_VALIDATION_POINT.longitude,
        result,
        1,
      ),
    ).toThrow(RangeError);
  });

  it("builds a focused central-phase track with exact endpoints", () => {
    const result = calculateEclipseCircumstances(
      BURGOS_VALIDATION_POINT.latitude,
      BURGOS_VALIDATION_POINT.longitude,
      elevation(BURGOS_VALIDATION_POINT.groundElevationMetres),
    );
    expect(result?.totalBegin).not.toBeNull();
    expect(result?.totalEnd).not.toBeNull();
    if (!result?.totalBegin || !result.totalEnd) return;

    const track = calculateEclipseAnimationWindowTrack(
      BURGOS_VALIDATION_POINT.latitude,
      BURGOS_VALIDATION_POINT.longitude,
      result,
      result.totalBegin,
      result.totalEnd,
      121,
    );
    expect(track).toHaveLength(121);
    expect(track[0].time).toEqual(result.totalBegin);
    expect(track.at(-1)?.time).toEqual(result.totalEnd);
    expect(() =>
      calculateEclipseAnimationWindowTrack(
        BURGOS_VALIDATION_POINT.latitude,
        BURGOS_VALIDATION_POINT.longitude,
        result,
        result.partialBegin,
        new Date(result.partialEnd.getTime() + 1),
      ),
    ).toThrow(RangeError);
  });

  it("rejects an invalid viewpoint height", () => {
    expect(() =>
      calculateEclipseCircumstances(42, -3, {
        groundElevationMetres: 500,
        viewpointHeightAboveGroundMetres: -1,
      }),
    ).toThrow(RangeError);
  });

  it("keeps missing totality explicit", () => {
    expect(formatDuration(null)).toBe("No totality");
  });
});
