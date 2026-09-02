import { describe, expect, it } from "vitest";
import {
  HORIZON_REVEAL_DURATION_MS,
  horizonRevealProgress,
} from "./horizon-reveal";

const timeline = {
  startProgress: 400,
  centralBeginProgress: 470,
  peakProgress: 500,
  centralEndProgress: 530,
  endProgress: 600,
};

describe("horizon reveal", () => {
  it("moves continuously through the central contacts and maximum", () => {
    expect(horizonRevealProgress(0, timeline)).toBe(400);
    expect(horizonRevealProgress(HORIZON_REVEAL_DURATION_MS * 0.28, timeline))
      .toBe(470);
    expect(horizonRevealProgress(HORIZON_REVEAL_DURATION_MS * 0.5, timeline))
      .toBe(500);
    expect(horizonRevealProgress(HORIZON_REVEAL_DURATION_MS * 0.72, timeline))
      .toBe(530);
    expect(horizonRevealProgress(HORIZON_REVEAL_DURATION_MS, timeline)).toBe(
      600,
    );
    const samples = Array.from({ length: 101 }, (_, index) =>
      horizonRevealProgress(
        (HORIZON_REVEAL_DURATION_MS * index) / 100,
        timeline,
      ),
    );
    expect(
      samples.slice(1).every((value, index) => value > samples[index]),
    ).toBe(true);
  });

  it("uses the shorter peak reveal when there is no central phase", () => {
    const partialTimeline = {
      ...timeline,
      centralBeginProgress: null,
      centralEndProgress: null,
    };

    expect(
      horizonRevealProgress(
        HORIZON_REVEAL_DURATION_MS * 0.5,
        partialTimeline,
      ),
    ).toBe(500);
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
