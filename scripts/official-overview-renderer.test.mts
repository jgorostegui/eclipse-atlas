import { describe, expect, it } from "vitest";
import {
  ALTITUDE_STOPS,
  colourForPhysicalValue,
  DURATION_STOPS,
  normaliseObscurationForColour,
  OBSCURATION_STOPS,
  OBSCURATION_RENDER_TOLERANCE_FRACTION,
  OFFICIAL_OVERVIEW_NODATA,
  renderMaximumObscurationPixel,
  renderSolarAltitudePixel,
  renderTotalityDurationBandPixel,
} from "./official-overview-renderer.mts";

describe("official overview rendering", () => {
  it("maps numeric scale endpoints to each declared evidence palette", () => {
    expect(colourForPhysicalValue(0, 0, 25, ALTITUDE_STOPS)).toEqual([
      39, 50, 77,
    ]);
    expect(colourForPhysicalValue(25, 0, 25, ALTITUDE_STOPS)).toEqual([
      255, 210, 122,
    ]);
    expect(ALTITUDE_STOPS).toHaveLength(5);
    expect(OBSCURATION_STOPS).toHaveLength(5);
    expect(DURATION_STOPS).toHaveLength(5);
  });

  it("keeps no-data and post-sunset maximum pixels transparent", () => {
    expect(renderSolarAltitudePixel(OFFICIAL_OVERVIEW_NODATA, 18, 19)).toEqual([
      0, 0, 0, 0,
    ]);
    expect(renderMaximumObscurationPixel(0.95, 20, 19)).toEqual([0, 0, 0, 0]);
  });

  it("renders direct physical quantities without a composite score", () => {
    expect(renderSolarAltitudePixel(10, 18, 19)[3]).toBe(210);
    expect(renderMaximumObscurationPixel(0.95, 18, 19)[3]).toBe(210);
    expect(renderTotalityDurationBandPixel(60, 70)[3]).toBe(220);
  });

  it("keeps values outside the declared visual domains transparent", () => {
    expect(renderSolarAltitudePixel(-0.1, 18, 19)).toEqual([0, 0, 0, 0]);
    expect(renderMaximumObscurationPixel(0.799, 18, 19)).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it("rejects corrupt physical values instead of clamping them", () => {
    expect(() => renderSolarAltitudePixel(91, 18, 19)).toThrow(RangeError);
    expect(() =>
      renderMaximumObscurationPixel(
        1 + OBSCURATION_RENDER_TOLERANCE_FRACTION + 1e-9,
        18,
        19,
      ),
    ).toThrow(RangeError);
    expect(() => renderSolarAltitudePixel(10, 25, 19)).toThrow(RangeError);
    expect(() => renderTotalityDurationBandPixel(120, 124)).toThrow(RangeError);
  });

  it("clamps tiny official obscuration overshoots for colour only", () => {
    expect(normaliseObscurationForColour(1.000013113)).toEqual({
      rawFraction: 1.000013113,
      colourFraction: 1,
      clamped: true,
    });
    expect(normaliseObscurationForColour(-0.00001)).toEqual({
      rawFraction: -0.00001,
      colourFraction: 0,
      clamped: true,
    });
    expect(
      normaliseObscurationForColour(-OBSCURATION_RENDER_TOLERANCE_FRACTION)
        .clamped,
    ).toBe(true);
    expect(
      normaliseObscurationForColour(
        1 + OBSCURATION_RENDER_TOLERANCE_FRACTION,
      ).clamped,
    ).toBe(true);
    expect(normaliseObscurationForColour(0).clamped).toBe(false);
    expect(normaliseObscurationForColour(1).clamped).toBe(false);
    expect(() => normaliseObscurationForColour(Number.NaN)).toThrow(RangeError);
  });
});
