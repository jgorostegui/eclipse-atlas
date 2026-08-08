import test from "node:test";
import assert from "node:assert/strict";
import { computeScienceDependencyDigest } from "../scripts/scientific-verification.mjs";

// A minimal package-lock v3 shape that mirrors the real closure: astronomy-engine
// (a root with no dependencies), geotiff (a root with a transitive dependency),
// pngjs (a root), and a build-only tree (vite -> postcss -> nanoid) that must not
// participate in the science digest.
function lockFixture() {
  return {
    packages: {
      "": { name: "eclipse-atlas" },
      "node_modules/astronomy-engine": { version: "2.1.19", integrity: "sha512-ae" },
      "node_modules/geotiff": {
        version: "3.0.5",
        integrity: "sha512-gt",
        dependencies: { pako: "^2.1.0", lerc: "^4.0.0" },
      },
      "node_modules/pako": { version: "2.1.0", integrity: "sha512-pk" },
      "node_modules/lerc": { version: "4.0.4", integrity: "sha512-le" },
      "node_modules/pngjs": { version: "7.0.0", integrity: "sha512-pn" },
      "node_modules/vite": {
        version: "8.0.16",
        integrity: "sha512-vi",
        dependencies: { postcss: "^8.5.0" },
      },
      "node_modules/postcss": {
        version: "8.5.25",
        integrity: "sha512-po",
        dependencies: { nanoid: "^3.3.11" },
      },
      "node_modules/nanoid": { version: "3.3.16", integrity: "sha512-na" },
    },
  };
}

test("patching a build-only dependency leaves the science digest unchanged", () => {
  const baseline = computeScienceDependencyDigest(lockFixture());
  const patched = lockFixture();
  patched.packages["node_modules/nanoid"].version = "3.3.18";
  patched.packages["node_modules/nanoid"].integrity = "sha512-na-patched";
  assert.equal(computeScienceDependencyDigest(patched), baseline);
});

test("bumping a science root moves the digest", () => {
  const baseline = computeScienceDependencyDigest(lockFixture());
  const bumped = lockFixture();
  bumped.packages["node_modules/astronomy-engine"].version = "2.2.0";
  assert.notEqual(computeScienceDependencyDigest(bumped), baseline);
});

test("bumping a transitive science dependency moves the digest", () => {
  const baseline = computeScienceDependencyDigest(lockFixture());
  const bumped = lockFixture();
  // pako is reachable only through geotiff, so it must still be bound.
  bumped.packages["node_modules/pako"].version = "2.1.1";
  assert.notEqual(computeScienceDependencyDigest(bumped), baseline);
});

test("a lockfile without a packages map is rejected", () => {
  assert.throws(() => computeScienceDependencyDigest({}), /packages map/);
});
