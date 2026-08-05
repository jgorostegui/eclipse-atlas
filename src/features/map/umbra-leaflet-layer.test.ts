import { describe, expect, it } from "vitest";
import type { OfficialUmbraFrame } from "../../data/official-overview";
import {
  officialUmbraFrameFeature,
  UMBRA_LEAFLET_STYLE,
} from "./umbra-leaflet-layer";

describe("official umbra Leaflet layer", () => {
  it("preserves official longitude/latitude multipolygons and holes", () => {
    const frame: OfficialUmbraFrame = {
      utcHours: 18.468,
      polygons: [
        [
          [[-4, 40], [-3, 40], [-3, 41], [-4, 41], [-4, 40]],
          [
            [-3.8, 40.2],
            [-3.2, 40.2],
            [-3.2, 40.8],
            [-3.8, 40.8],
            [-3.8, 40.2],
          ],
        ],
      ],
    };

    expect(officialUmbraFrameFeature(frame)).toEqual({
      type: "Feature",
      properties: { utcHours: 18.468 },
      geometry: {
        type: "MultiPolygon",
        coordinates: frame.polygons,
      },
    });
  });

  it("uses a translucent warm cartographic style without a score", () => {
    expect(UMBRA_LEAFLET_STYLE.fillOpacity).toBeLessThan(0.5);
    expect(UMBRA_LEAFLET_STYLE.weight).toBeGreaterThanOrEqual(2);
    expect(UMBRA_LEAFLET_STYLE).not.toHaveProperty("score");
  });
});
