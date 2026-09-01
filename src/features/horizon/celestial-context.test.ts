import { describe, expect, it } from "vitest";
import { calculateCelestialContext, celestialObjectIds } from "./celestial-context";

describe("calculated celestial context", () => {
  it("returns one finite position for each curated object", () => {
    const objects = calculateCelestialContext({
      time: new Date("2026-08-12T18:27:00.000Z"),
      latitude: 42.75017,
      longitude: -3.136696,
      observerElevationMetres: 700,
    });

    expect(objects.map(({ id }) => id)).toEqual(celestialObjectIds);
    expect(
      objects.every(
        ({ altitudeDegrees, azimuthDegrees }) =>
          Number.isFinite(altitudeDegrees) &&
          Number.isFinite(azimuthDegrees) &&
          azimuthDegrees >= 0 &&
          azimuthDegrees < 360,
      ),
    ).toBe(true);
    expect(objects.filter(({ kind }) => kind === "planet")).toHaveLength(5);
    expect(objects.filter(({ kind }) => kind === "star")).toHaveLength(8);
  });

  it("rejects invalid observer inputs", () => {
    expect(() =>
      calculateCelestialContext({
        time: new Date(Number.NaN),
        latitude: 42,
        longitude: -3,
        observerElevationMetres: 700,
      }),
    ).toThrow(RangeError);
  });

  it.each([
    {
      time: "2026-08-12T18:27:00.000Z",
      expected: {
        venus: [25.65351, 237.79866, -4.43491],
        jupiter: [3.66613, 291.91975, -1.78125],
        regulus: [13.62756, 273.69412, null],
      },
    },
    {
      time: "2027-08-02T10:00:00.000Z",
      expected: {
        venus: [54.2304, 120.48093, -3.95485],
        jupiter: [32.61211, 105.10808, -1.71627],
        regulus: [33.61895, 106.18795, null],
      },
    },
    {
      time: "2028-01-26T16:00:00.000Z",
      expected: {
        venus: [38.97107, 198.94651, -4.08561],
        jupiter: [-44.36095, 6.16469, -2.30176],
        regulus: [-28.51205, 33.85761, null],
      },
    },
  ])("keeps frozen event-year reference positions for $time", ({ time, expected }) => {
    const objects = calculateCelestialContext({
      time: new Date(time),
      latitude: 42.75017,
      longitude: -3.136696,
      observerElevationMetres: 700,
    });

    for (const [id, values] of Object.entries(expected)) {
      const object = objects.find((candidate) => candidate.id === id);
      expect(object).toBeDefined();
      expect(object!.altitudeDegrees).toBeCloseTo(values[0]!, 4);
      expect(object!.azimuthDegrees).toBeCloseTo(values[1]!, 4);
      if (values[2] === null) expect(object!.magnitude).toBeNull();
      else expect(object!.magnitude).toBeCloseTo(values[2], 4);
    }
  });
});
