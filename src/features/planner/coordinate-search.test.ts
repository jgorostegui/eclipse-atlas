import { describe, expect, it } from "vitest";
import { parseCoordinateSearch } from "./coordinate-search";

describe("parseCoordinateSearch", () => {
  it("parses the comma-and-space form copied from Google Maps", () => {
    expect(parseCoordinateSearch("42.1234, -3.5678")).toEqual({
      latitude: 42.1234,
      longitude: -3.5678,
    });
  });

  it.each([
    ["42.1234,-3.5678", { latitude: 42.1234, longitude: -3.5678 }],
    ["42.1234 -3.5678", { latitude: 42.1234, longitude: -3.5678 }],
    ["  42.1234 , -3.5678  ", { latitude: 42.1234, longitude: -3.5678 }],
    ["41.7636,-2.4649", { latitude: 41.7636, longitude: -2.4649 }],
    ["-33.8688, 151.2093", { latitude: -33.8688, longitude: 151.2093 }],
    ["40, -3", { latitude: 40, longitude: -3 }],
  ])("accepts the separator variant %s", (input, expected) => {
    expect(parseCoordinateSearch(input)).toEqual(expected);
  });

  it("returns null for out-of-range latitude or longitude", () => {
    expect(parseCoordinateSearch("120, 4")).toBeNull();
    expect(parseCoordinateSearch("40, 240")).toBeNull();
  });

  it.each([
    "",
    "   ",
    "Soria",
    "Medina de Pomar",
    "42.1234",
    "40.4, Madrid",
    "42,1234, -3,5678",
    "42.1234, -3.5678, 100",
  ])("returns null for the non-coordinate query %j", (input) => {
    expect(parseCoordinateSearch(input)).toBeNull();
  });
});
