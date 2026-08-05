import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const artifactUrl = new URL(
  "public/climate/v1/august-cloud-cover-era5-v1.json",
  root,
);

test("binds the public ERA5 climatology artifact to its checksum and references", async () => {
  const [rawArtifact, checksumFile, rawReferences, rawCatalog] = await Promise.all([
    readFile(artifactUrl, "utf8"),
    readFile(
      new URL("public/climate/v1/august-cloud-cover-era5-v1.sha256", root),
      "utf8",
    ),
    readFile(new URL("src/data/national-planning-points.json", root), "utf8"),
    readFile(new URL("public/sources.json", root), "utf8"),
  ]);
  const artifact = JSON.parse(rawArtifact);
  const references = JSON.parse(rawReferences);
  const catalog = JSON.parse(rawCatalog);
  const digest = createHash("sha256").update(rawArtifact).digest("hex");
  const source = catalog.sources.find(
    ({ id }) => id === "copernicus-era5-august-cloud-climate",
  );

  assert.equal(checksumFile.trim(), `${digest}  august-cloud-cover-era5-v1.json`);
  assert.match(source.version, new RegExp(`SHA-256 ${digest}\\.`));
  assert.equal(artifact.artifactVersion, "era5-august-evening-v1");
  assert.deepEqual(artifact.sampling.period, { startYear: 1991, endYear: 2020 });
  assert.equal(artifact.sampling.month, 8);
  assert.equal(artifact.sampling.utcHour, 18);
  assert.equal(artifact.sampling.samplesPerPoint, 930);
  assert.equal(artifact.sampling.referencePointCount, 41);
  assert.equal(artifact.sampling.statisticalDownscaling, false);
  assert.match(artifact.generation.rawInputAggregateSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(
    artifact.points.map(({ candidateId }) => candidateId),
    references.points.map(({ id }) => id),
  );
  for (const [index, point] of artifact.points.entries()) {
    const reference = references.points[index];
    assert.deepEqual(point.requestedCoordinate, {
      latitude: reference.latitude,
      longitude: reference.longitude,
    });
    assert.equal(point.sampleCount, 930);
    assert.ok(point.percentile25CloudCoverPercent <= point.medianCloudCoverPercent);
    assert.ok(point.medianCloudCoverPercent <= point.percentile75CloudCoverPercent);
    for (const value of [
      point.meanCloudCoverPercent,
      point.percentile25CloudCoverPercent,
      point.medianCloudCoverPercent,
      point.percentile75CloudCoverPercent,
    ]) {
      assert.ok(value >= 0 && value <= 100);
    }
  }
});
