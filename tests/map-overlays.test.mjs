import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { PNG } from "pngjs";

const root = new URL("../", import.meta.url);
const overlayDirectory = new URL("../public/map-overlays/v1/", import.meta.url);

const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

function hasObjectKey(value, prohibitedKey) {
  if (Array.isArray(value)) {
    return value.some((entry) => hasObjectKey(entry, prohibitedKey));
  }
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([key, entry]) =>
      key === prohibitedKey || hasObjectKey(entry, prohibitedKey),
  );
}

test("publishes checksum-bound official regional overview artifacts", async () => {
  const manifestBuffer = await readFile(
    new URL("official-eclipse-overlays-v1.json", overlayDirectory),
  );
  const manifest = JSON.parse(manifestBuffer.toString("utf8"));
  const checksums = JSON.parse(
    await readFile(
      new URL("official-eclipse-overlays-v1.checksums.json", overlayDirectory),
      "utf8",
    ),
  );

  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.artifactVersion, "2.1.0");
  assert.equal(
    manifest.source.sha256,
    "547d772490b5080f6f423ccef382a78ba5a235791cd7234b5060724e77b4baa0",
  );
  assert.equal(manifest.crop.width, 2094);
  assert.equal(manifest.crop.height, 1928);
  assert.equal(
    manifest.vectorSource.sha256,
    "4bc79c4c2e3692a1105cd9d415f5f10f1b4076af8ad14f9cf48169ec070b8944",
  );
  assert.equal(
    checksums.files["official-eclipse-overlays-v1.json"],
    sha256(manifestBuffer),
  );
  assert.deepEqual(
    manifest.outputs.map((output) => output.id),
    [
      "solar-altitude-at-maximum",
      "maximum-obscuration",
      "totality-duration",
    ],
  );

  for (const output of manifest.outputs) {
    const buffer = await readFile(new URL(output.file, overlayDirectory));
    const image = PNG.sync.read(buffer);
    assert.equal(image.width, 2094);
    assert.equal(image.height, 1928);
    assert.equal(sha256(buffer), output.sha256);
    assert.equal(checksums.files[output.file], output.sha256);
    const alpha = image.data.filter((_, index) => index % 4 === 3);
    assert.ok(alpha.includes(0));
    assert.ok(
      alpha.includes(output.id === "totality-duration" ? 220 : 210),
    );
    assert.equal(output.palette.length, 5);
  }

  const obscuration = manifest.outputs.find(
    (output) => output.id === "maximum-obscuration",
  );
  assert.equal(obscuration.sourceAudit.upperClampCount, 2669);
  assert.equal(obscuration.sourceAudit.lowerClampCount, 0);
  assert.equal(obscuration.sourceAudit.outOfToleranceCount, 0);
  assert.equal(obscuration.sourceAudit.scientificValuesModified, false);
  assert.equal(obscuration.sourceAudit.pixelQueryEnabled, false);

  const duration = manifest.outputs.find(
    (output) => output.id === "totality-duration",
  );
  assert.equal(duration.sourceAudit.bandCount, 13);
  assert.equal(duration.sourceAudit.minimumSeconds, 0);
  assert.ok(Math.abs(duration.sourceAudit.maximumSeconds - 122.7997) < 0.0001);
  assert.equal(
    duration.sourceAudit.coverageMask.source,
    "union of 277 official sampled umbra footprints",
  );
  assert.equal(
    duration.sourceAudit.coverageMask.sameLineageDisplayTransform,
    true,
  );

  const durationImage = PNG.sync.read(
    await readFile(new URL(duration.file, overlayDirectory)),
  );
  const webMercatorY = (latitude) =>
    Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360));
  const alphaAt = (latitude, longitude) => {
    const bounds = manifest.crop.leafletBounds;
    const x = Math.floor(
      ((longitude - bounds.west) / (bounds.east - bounds.west)) *
        durationImage.width,
    );
    const y = Math.floor(
      ((webMercatorY(bounds.north) - webMercatorY(latitude)) /
        (webMercatorY(bounds.north) - webMercatorY(bounds.south))) *
        durationImage.height,
    );
    return durationImage.data[(y * durationImage.width + x) * 4 + 3];
  };
  const outsideTotality = [
    { name: "Madrid", latitude: 40.4168, longitude: -3.7038 },
    { name: "Seville", latitude: 37.3891, longitude: -5.9845 },
  ];
  const insideTotality = [
    { name: "Burgos neutral control", latitude: 42.3439, longitude: -3.6969 },
    { name: "Soria", latitude: 41.7636, longitude: -2.4649 },
    { name: "Arguedas", latitude: 42.177, longitude: -1.598 },
  ];
  for (const point of outsideTotality) {
    assert.equal(alphaAt(point.latitude, point.longitude), 0, point.name);
  }
  for (const point of insideTotality) {
    assert.equal(alphaAt(point.latitude, point.longitude), 220, point.name);
  }

  const umbraBuffer = await readFile(
    new URL(manifest.animation.file, overlayDirectory),
  );
  const umbra = JSON.parse(umbraBuffer.toString("utf8"));
  assert.equal(umbra.frames.length, 277);
  assert.equal(umbra.frames[0].utcHours, 18.293);
  assert.equal(umbra.frames.at(-1).utcHours, 18.569);
  assert.equal(umbra.sampling.stepSeconds, 3.6);
  assert.equal(sha256(umbraBuffer), manifest.animation.sha256);
  assert.equal(
    checksums.files[manifest.animation.file],
    manifest.animation.sha256,
  );
  const hostHomePrefix = ["/", "home", "/"].join("");
  assert.equal(umbraBuffer.includes(Buffer.from(hostHomePrefix)), false);
  assert.equal(hasObjectKey(umbra, "path"), false);
});

test("keeps source geospatial containers out of public overlay artifacts", async () => {
  const files = await readdir(overlayDirectory);
  assert.deepEqual(files.sort(), [
    "maximum-obscuration.png",
    "official-eclipse-overlays-v1.checksums.json",
    "official-eclipse-overlays-v1.json",
    "official-umbra-passage-v1.json",
    "solar-altitude-at-maximum.png",
    "totality-duration.png",
  ]);
  assert.equal(
    files.some((file) => /\.(?:gpkg|tiff?)$/i.test(file)),
    false,
  );
});

test("copies official overview artifacts into the portable build", async () => {
  for (const file of await readdir(overlayDirectory)) {
    assert.deepEqual(
      await readFile(new URL(`dist/map-overlays/v1/${file}`, root)),
      await readFile(new URL(file, overlayDirectory)),
    );
  }
});

for (const expected of [
  {
    eventId: "2027",
    centralPhaseKind: "total",
    shadowKind: "umbra",
    frameCount: 724,
  },
  {
    eventId: "2028",
    centralPhaseKind: "annular",
    shadowKind: "antumbra",
    frameCount: 353,
  },
]) {
  test(`publishes checksum-bound ${expected.eventId} official overview artifacts`, async () => {
    const directory = new URL(
      `../public/map-overlays/${expected.eventId}/`,
      import.meta.url,
    );
    const manifestBuffer = await readFile(
      new URL("official-eclipse-overlays.json", directory),
    );
    const manifest = JSON.parse(manifestBuffer.toString("utf8"));
    const checksums = JSON.parse(
      await readFile(new URL("checksums.json", directory), "utf8"),
    );

    assert.equal(manifest.schemaVersion, 3);
    assert.equal(manifest.event.id, expected.eventId);
    assert.equal(manifest.event.centralPhaseKind, expected.centralPhaseKind);
    assert.equal(manifest.event.centralShadowKind, expected.shadowKind);
    assert.equal(manifest.animation.shadowKind, expected.shadowKind);
    assert.equal(manifest.animation.frameCount, expected.frameCount);
    assert.equal(
      checksums.files["official-eclipse-overlays.json"],
      sha256(manifestBuffer),
    );

    let hasTransparentPixels = false;
    for (const output of manifest.outputs) {
      const buffer = await readFile(new URL(output.file, directory));
      const image = PNG.sync.read(buffer);
      assert.equal(image.width, manifest.crop.width);
      assert.equal(image.height, manifest.crop.height);
      assert.equal(output.sha256, sha256(buffer));
      assert.equal(checksums.files[output.file], output.sha256);
      const alpha = image.data.filter((_, index) => index % 4 === 3);
      hasTransparentPixels ||= alpha.includes(0);
      assert.ok(alpha.some((value) => value > 0));
    }
    assert.equal(hasTransparentPixels, true);

    const shadowBuffer = await readFile(
      new URL(manifest.animation.file, directory),
    );
    const shadow = JSON.parse(shadowBuffer.toString("utf8"));
    assert.equal(shadow.eventId, expected.eventId);
    assert.equal(shadow.shadowKind, expected.shadowKind);
    assert.equal(shadow.frames.length, expected.frameCount);
    assert.equal(sha256(shadowBuffer), manifest.animation.sha256);
    assert.equal(
      checksums.files[manifest.animation.file],
      manifest.animation.sha256,
    );
    assert.equal(hasObjectKey(shadow, "path"), false);

    const files = await readdir(directory);
    assert.equal(files.some((file) => /\.(?:gpkg|tiff?)$/i.test(file)), false);
    for (const file of files) {
      assert.deepEqual(
        await readFile(
          new URL(`../dist/map-overlays/${expected.eventId}/${file}`, import.meta.url),
        ),
        await readFile(new URL(file, directory)),
      );
    }
  });
}
