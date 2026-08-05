import type { Feature, MultiPolygon } from "geojson";
import type { OfficialUmbraFrame } from "../../data/official-overview";

export const UMBRA_LEAFLET_STYLE = {
  color: "#ffb56b",
  fillColor: "#641f3e",
  fillOpacity: 0.48,
  opacity: 0.96,
  weight: 2.5,
} as const;

export function officialUmbraFrameFeature(
  frame: OfficialUmbraFrame,
): Feature<MultiPolygon, { utcHours: number }> {
  return {
    type: "Feature",
    properties: { utcHours: frame.utcHours },
    geometry: {
      type: "MultiPolygon",
      coordinates: frame.polygons,
    },
  };
}
