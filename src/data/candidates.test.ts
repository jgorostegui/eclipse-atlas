import { describe, expect, it } from "vitest";
import { candidates } from "./candidates";

describe("national planning catalogue", () => {
  it("opens with a distributed national catalogue and keeps local references optional", () => {
    const visible = candidates.filter((candidate) => candidate.defaultVisible);
    const categoryCounts = visible.reduce<Record<string, number>>(
      (counts, candidate) => ({
        ...counts,
        [candidate.category]: (counts[candidate.category] ?? 0) + 1,
      }),
      {},
    );

    expect(visible).toHaveLength(124);
    expect(categoryCounts).toEqual({
      "totality-city": 23,
      "official-observation": 83,
      "candidate-viewpoint": 8,
      "partial-context": 10,
    });
    expect(
      visible.filter((candidate) => candidate.atmosphereReference),
    ).toHaveLength(41);
    expect(
      candidates.find((candidate) => candidate.id === "burgos-neutral-control")
        ?.defaultVisible,
    ).toBe(false);
  });

  it("keeps identifiers unique and every published anchor traceable", () => {
    expect(new Set(candidates.map(({ id }) => id)).size).toBe(candidates.length);

    for (const candidate of candidates.filter(
      ({ defaultVisible }) => defaultVisible,
    )) {
      expect(candidate.coordinate.sourceUrl).toMatch(
        /^https:\/\/(?:www\.geonames\.org|www\.openstreetmap\.org|www\.jcyl\.es)\//,
      );
      expect(candidate.latitude).toBeGreaterThanOrEqual(-90);
      expect(candidate.latitude).toBeLessThanOrEqual(90);
      expect(candidate.longitude).toBeGreaterThanOrEqual(-180);
      expect(candidate.longitude).toBeLessThanOrEqual(180);
    }
  });

  it("keeps every official point linked and does not silently merge upstream rows", () => {
    const official = candidates.filter(
      ({ category }) => category === "official-observation",
    );
    const castillaYLeon = official.filter(({ id }) => id.startsWith("jcyl-"));

    expect(official).toHaveLength(83);
    expect(castillaYLeon).toHaveLength(75);
    expect(castillaYLeon.filter(({ shortName }) => shortName === "Burgos")).toHaveLength(2);
    expect(castillaYLeon.filter(({ shortName }) => shortName === "Tejada")).toHaveLength(2);
    expect(castillaYLeon.filter(({ shortName }) => shortName === "Tiedra")).toHaveLength(2);

    for (const candidate of official) {
      expect(candidate.operations.sourceUrl).toMatch(/^https:\/\//);
      expect(candidate.operations.status).toMatch(
        /^official-(?:network|recommended)$/,
      );
      expect(candidate.atmosphereReference).toBe(false);
    }
  });
});
