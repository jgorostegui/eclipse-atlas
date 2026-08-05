import { describe, expect, it } from "vitest";
import {
  CLOUD_COVER_COLOR_STOPS,
  CLOUD_COVER_LEGEND_GRADIENT,
  cloudCoverColor,
  cloudCoverTextColor,
} from "./cloud-cover-palette";

function luminance(hex: string) {
  const channels = [1, 3, 5].map((index) => {
    const normalized = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return (
    0.2126 * (channels[0] ?? 0) +
    0.7152 * (channels[1] ?? 0) +
    0.0722 * (channels[2] ?? 0)
  );
}

function contrastRatio(first: string, second: string) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return ((values[0] ?? 0) + 0.05) / ((values[1] ?? 0) + 0.05);
}

describe("cloud-cover palette", () => {
  it("uses a continuous clear-sky to overcast blue scale", () => {
    expect(cloudCoverColor(-1)).toBe("#edf8fb");
    expect(cloudCoverColor(0)).toBe("#edf8fb");
    expect(cloudCoverColor(50)).toBe("#75adc5");
    expect(cloudCoverColor(100)).toBe("#243f65");
    expect(cloudCoverColor(101)).toBe("#243f65");
    expect(cloudCoverColor(10)).not.toBe(cloudCoverColor(15));
    expect(CLOUD_COVER_COLOR_STOPS.map(({ color }) => color)).not.toContain(
      "#e7bf4e",
    );
  });

  it("keeps marker values at WCAG AA contrast throughout the scale", () => {
    for (let percent = 0; percent <= 100; percent += 1) {
      const background = cloudCoverColor(percent);
      expect(
        contrastRatio(background, cloudCoverTextColor(background)),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps the legend bound to every palette stop", () => {
    for (const { percent, color } of CLOUD_COVER_COLOR_STOPS) {
      expect(CLOUD_COVER_LEGEND_GRADIENT).toContain(`${color} ${percent}%`);
    }
  });
});
