import { describe, expect, it } from "vitest";
import {
  displayTimeZoneForSupportedCoordinate,
  terrainRequestEnvelopeAt,
} from "./terrain-coverage";

describe("TerrainRGB request envelopes", () => {
  it.each([
    [42.3439, -3.6969, "main-terrain-request-envelope", "Europe/Madrid"],
    [39.5696, 2.6502, "main-terrain-request-envelope", "Europe/Madrid"],
    [35.8894, -5.3213, "main-terrain-request-envelope", "Europe/Madrid"],
    [35.2923, -2.9381, "melilla-terrain-request-envelope", "Europe/Madrid"],
    [28.2916, -16.6291, "canary-terrain-request-envelope", "Atlantic/Canary"],
  ])("resolves %s, %s to its request envelope", (latitude, longitude, id, zone) => {
    expect(terrainRequestEnvelopeAt(latitude, longitude)?.id).toBe(id);
    expect(displayTimeZoneForSupportedCoordinate(latitude, longitude)).toBe(
      zone,
    );
  });

  it("documents that an envelope is not Spain's political boundary", () => {
    expect(terrainRequestEnvelopeAt(38.72, -9.14)?.id).toBe(
      "main-terrain-request-envelope",
    );
  });

  it.each([
    [35.5, -10],
    [44.5, 4.5],
    [27.5, -18.5],
    [29.5, -13],
    [35.2, -3.1],
    [35.4, -2.85],
  ])("includes the configured boundary at %s, %s", (latitude, longitude) => {
    expect(terrainRequestEnvelopeAt(latitude, longitude)).not.toBeNull();
  });

  it.each([
    [Number.NaN, 0],
    [0, Number.POSITIVE_INFINITY],
    [51.5, -0.1],
    [32.65, -16.91],
    [44.5001, 0],
  ])("rejects coordinates outside an envelope", (latitude, longitude) => {
    expect(terrainRequestEnvelopeAt(latitude, longitude)).toBeNull();
  });
});
