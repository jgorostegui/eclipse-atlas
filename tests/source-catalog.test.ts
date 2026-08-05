// @vitest-environment node

import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { sourceCatalogSchema } from "../src/data/source-catalog";

async function readCatalog() {
  return JSON.parse(
    await readFile(new URL("../public/sources.json", import.meta.url), "utf8"),
  ) as unknown;
}

describe("public source catalog", () => {
  it("validates every published source record", async () => {
    const catalog = sourceCatalogSchema.parse(await readCatalog());

    expect(catalog.sources.some((source) => source.status === "in-use")).toBe(
      true,
    );
    expect(
      catalog.sources.every(
        (source) => source.limitations.length > 0 && source.retrievedAt,
      ),
    ).toBe(true);
    expect(catalog.sources.map((source) => source.id)).toContain(
      "aas-eye-safety",
    );
    expect(catalog.sources.map((source) => source.id)).toContain(
      "nasa-gsfc-2026-besselian-elements",
    );
    expect(catalog.sources.map((source) => source.id)).toContain(
      "nasa-gsfc-2027-besselian-elements",
    );
    expect(catalog.sources.map((source) => source.id)).toContain(
      "nasa-gsfc-2028-besselian-elements",
    );
    expect(catalog.sources.map((source) => source.id)).toContain(
      "ign-oan-2027-eclipse-products",
    );
    expect(catalog.sources.map((source) => source.id)).toContain(
      "ign-oan-2028-eclipse-products",
    );
    expect(catalog.sources.map((source) => source.id)).toContain(
      "iers-bulletin-a-xxxix-031",
    );
    expect(catalog.sources.map((source) => source.id)).toContain(
      "ign-eclipse-practical-recommendations",
    );
    expect(catalog.sources.map((source) => source.id)).toContain(
      "trio-eclipses-public-platform",
    );
    expect(catalog.sources.map((source) => source.id)).toContain(
      "copernicus-era5-august-cloud-climate",
    );
    expect(catalog.sources.map((source) => source.id)).toContain(
      "open-meteo-ecmwf-ifs-forecast",
    );
    expect(catalog.sources.map((source) => source.id)).not.toContain(
      "iso-12312-2",
    );
    expect(
      catalog.sources.find((source) => source.id === "ign-cnig-terrain-rgb")
        ?.attribution,
    ).toContain("© Instituto Geográfico Nacional de España");
    const astronomyEngine = catalog.sources.find(
      (source) => source.id === "astronomy-engine-2.1.19",
    );
    expect(astronomyEngine?.role).toContain("positions and angular radii");
    expect(astronomyEngine?.role.toLowerCase()).not.toContain("contacts");
    expect(astronomyEngine?.role.toLowerCase()).not.toContain("duration");
  });

  it("rejects duplicate identifiers and unknown fields", async () => {
    const catalog = sourceCatalogSchema.parse(await readCatalog());
    const duplicate = structuredClone(catalog);
    const firstSource = duplicate.sources[0];
    expect(firstSource).toBeDefined();
    if (!firstSource) return;
    duplicate.sources.push(structuredClone(firstSource));
    expect(() => sourceCatalogSchema.parse(duplicate)).toThrow(
      `Duplicate source id: ${firstSource.id}`,
    );

    expect(() =>
      sourceCatalogSchema.parse({ ...catalog, unexpected: true }),
    ).toThrow();
    expect(() =>
      sourceCatalogSchema.parse({
        ...catalog,
        sources: [
          { ...firstSource, unexpected: true },
          ...catalog.sources.slice(1),
        ],
      }),
    ).toThrow();
  });
});
