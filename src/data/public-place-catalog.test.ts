import { describe, expect, it } from "vitest";
import publicPlaceCatalog from "./public-place-catalog.json" with {
  type: "json",
};

describe("public place catalog", () => {
  it("retains the generated selection counts and source snapshots", () => {
    expect(publicPlaceCatalog.counts).toEqual({
      cities: 562,
      viewpoints: 346,
      astronomyObjects: 93,
      total: 1_001,
    });
    expect(publicPlaceCatalog.sources.geonames.txtSha256).toBe(
      "a1354c6fd3a48fd54ec714f00ebefabff77919466a740888cad7a1f8b079957f",
    );
    expect(publicPlaceCatalog.sources.openstreetmap.viewpoints.sha256).toBe(
      "d0cf461b7a1748e5d479ec26777ca8eb5215dee7b79db2755a33d6a0daea4a23",
    );
    expect(publicPlaceCatalog.sources.openstreetmap.spainBoundary.osmId).toBe(
      1311341,
    );
  });

  it("keeps every point unique, traceable and free of suitability fields", () => {
    expect(
      new Set(publicPlaceCatalog.points.map(({ id }) => id)).size,
    ).toBe(publicPlaceCatalog.points.length);
    for (const point of publicPlaceCatalog.points) {
      expect(point.latitude).toBeGreaterThanOrEqual(-90);
      expect(point.latitude).toBeLessThanOrEqual(90);
      expect(point.longitude).toBeGreaterThanOrEqual(-180);
      expect(point.longitude).toBeLessThanOrEqual(180);
      expect(point.sourceUrl).toMatch(
        /^https:\/\/(?:www\.geonames\.org|www\.openstreetmap\.org)\//,
      );
      expect(Object.keys(point)).not.toContain("score");
      expect(Object.keys(point)).not.toContain("ranking");
    }
  });
});
