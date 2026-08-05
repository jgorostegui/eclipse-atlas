import { describe, expect, it } from "vitest";
import climateArtifactJson from "../../public/climate/v1/august-cloud-cover-era5-v1.json";
import { parseCloudClimateArtifact } from "./cloud-climate";

const loadClimateArtifact = () => structuredClone(climateArtifactJson) as unknown;

describe("ERA5 cloud climate artifact", () => {
  it("binds the 1991–2020 national reference sample", () => {
    const artifact = parseCloudClimateArtifact(loadClimateArtifact());

    expect(artifact.points).toHaveLength(41);
    expect(artifact.sampling).toMatchObject({
      utcHour: 18,
      samplesPerPoint: 930,
      nativeGridDegrees: 0.25,
      statisticalDownscaling: false,
    });
    expect(artifact.points.every((point) => point.sampleCount === 930)).toBe(true);
  });

  it("rejects duplicated point identities and inverted percentiles", () => {
    const base = loadClimateArtifact() as {
      points: Array<Record<string, unknown>>;
    };
    const duplicate = structuredClone(base);
    duplicate.points[1] = {
      ...duplicate.points[1],
      candidateId: duplicate.points[0]?.candidateId,
    };
    expect(() => parseCloudClimateArtifact(duplicate)).toThrow("Duplicate climate point");

    const inverted = structuredClone(base);
    inverted.points[0] = {
      ...inverted.points[0],
      percentile25CloudCoverPercent: 90,
      medianCloudCoverPercent: 50,
    };
    expect(() => parseCloudClimateArtifact(inverted)).toThrow("percentiles are out of order");
  });
});
