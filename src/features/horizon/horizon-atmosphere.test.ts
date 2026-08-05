import { describe, expect, it } from "vitest";
import { horizonAtmosphereAtSolarAltitude } from "./horizon-atmosphere";

describe("horizonAtmosphereAtSolarAltitude", () => {
  it("uses stable twilight endpoints outside the visual range", () => {
    expect(horizonAtmosphereAtSolarAltitude(-20)).toEqual(
      horizonAtmosphereAtSolarAltitude(-4),
    );
    expect(horizonAtmosphereAtSolarAltitude(40)).toEqual(
      horizonAtmosphereAtSolarAltitude(18),
    );
  });

  it("changes the sky and ridge treatment with the inspected altitude", () => {
    const horizon = horizonAtmosphereAtSolarAltitude(0);
    const maximum = horizonAtmosphereAtSolarAltitude(8);
    const earlyPartial = horizonAtmosphereAtSolarAltitude(18);

    expect(new Set([horizon.skyUpper, maximum.skyUpper, earlyPartial.skyUpper]))
      .toHaveLength(3);
    expect(horizon.glowOpacity).toBeGreaterThan(earlyPartial.glowOpacity);
    expect(maximum.ridgeOpacity).toBeGreaterThan(earlyPartial.ridgeOpacity);
  });

  it("interpolates continuously between defined visual states", () => {
    const lower = horizonAtmosphereAtSolarAltitude(8);
    const middle = horizonAtmosphereAtSolarAltitude(13);
    const upper = horizonAtmosphereAtSolarAltitude(18);

    expect(middle.skyUpper).not.toBe(lower.skyUpper);
    expect(middle.skyUpper).not.toBe(upper.skyUpper);
    expect(middle.glowOpacity).toBeCloseTo(
      (lower.glowOpacity + upper.glowOpacity) / 2,
    );
  });

  it("rejects a non-finite altitude", () => {
    expect(() => horizonAtmosphereAtSolarAltitude(Number.NaN)).toThrow(
      RangeError,
    );
  });
});
