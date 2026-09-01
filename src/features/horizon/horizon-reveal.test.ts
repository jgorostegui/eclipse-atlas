import { describe, expect, it } from "vitest";
import {
  HORIZON_REVEAL_DURATION_MS,
  horizonRevealProgress,
} from "./horizon-reveal";

const timeline = {
  startProgress: 400,
  peakProgress: 500,
  endProgress: 600,
};

describe("horizon reveal", () => {
  it("moves through maximum, pauses, and finishes after the central phase", () => {
    expect(horizonRevealProgress(0, timeline)).toBe(400);
    expect(horizonRevealProgress(HORIZON_REVEAL_DURATION_MS * 0.5, timeline))
      .toBe(500);
    expect(horizonRevealProgress(HORIZON_REVEAL_DURATION_MS, timeline)).toBe(
      600,
    );
  });

  it("clamps time and rejects non-finite input", () => {
    expect(horizonRevealProgress(-1, timeline)).toBe(400);
    expect(horizonRevealProgress(HORIZON_REVEAL_DURATION_MS * 2, timeline))
      .toBe(600);
    expect(() => horizonRevealProgress(Number.NaN, timeline)).toThrow(
      RangeError,
    );
  });
});
