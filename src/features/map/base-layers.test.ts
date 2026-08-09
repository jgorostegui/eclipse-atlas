import { describe, expect, it } from "vitest";
import {
  IGN_BASE_ATTRIBUTION,
  ignBaseLayers,
  isMapBaseLayerId,
  mapBaseLayerIds,
} from "./base-layers";

describe("map base layers", () => {
  it("offers the street base first and the two IGN bases", () => {
    expect(mapBaseLayerIds).toEqual(["osm", "ign-mtn", "ign-pnoa"]);
  });

  it("defines an HTTPS tile template for every IGN base", () => {
    for (const definition of Object.values(ignBaseLayers)) {
      expect(definition.urlTemplate).toMatch(/^https:\/\//);
      expect(definition.maxZoom).toBeGreaterThanOrEqual(14);
    }
  });

  it("keeps the WMTS template addressed by tile matrix, row and column", () => {
    const template = ignBaseLayers["ign-mtn"].urlTemplate;
    expect(template).toContain("{z}");
    expect(template).toContain("{y}");
    expect(template).toContain("{x}");
  });

  it("keeps the PNOA template on the TMS row axis", () => {
    expect(ignBaseLayers["ign-pnoa"].urlTemplate).toContain("{-y}");
  });

  it("attributes the IGN visibly", () => {
    expect(IGN_BASE_ATTRIBUTION).toContain("Instituto Geográfico Nacional");
    expect(IGN_BASE_ATTRIBUTION).toContain("https://www.ign.es/");
  });

  it("recognises only known base identifiers", () => {
    expect(isMapBaseLayerId("osm")).toBe(true);
    expect(isMapBaseLayerId("ign-pnoa")).toBe(true);
    expect(isMapBaseLayerId("google")).toBe(false);
  });
});
