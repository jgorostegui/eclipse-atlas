export const mapBaseLayerIds = ["osm", "ign-mtn", "ign-pnoa"] as const;

export type MapBaseLayerId = (typeof mapBaseLayerIds)[number];

export type IgnBaseLayerDefinition = Readonly<{
  urlTemplate: string;
  maxZoom: number;
}>;

// Visible attribution required by the IGN/CNIG CC BY 4.0-compatible licence.
export const IGN_BASE_ATTRIBUTION =
  '&copy; <a href="https://www.ign.es/" target="_blank" rel="noreferrer">Instituto Geográfico Nacional</a>';

// The OpenStreetMap street base always stays underneath. The IGN services
// cover Spain only, so keeping OSM as the underlay avoids blank surroundings
// when a tile is missing or outside national coverage.
export const ignBaseLayers: Readonly<
  Record<Exclude<MapBaseLayerId, "osm">, IgnBaseLayerDefinition>
> = {
  "ign-mtn": {
    urlTemplate:
      "https://www.ign.es/wmts/mapa-raster?request=getTile&service=WMTS&version=1.0.0&layer=MTN&style=default&tilematrixset=GoogleMapsCompatible&tilematrix={z}&tilerow={y}&tilecol={x}&format=image/jpeg",
    maxZoom: 17,
  },
  "ign-pnoa": {
    urlTemplate: "https://tms-pnoa-ma.idee.es/1.0.0/pnoa-ma/{z}/{x}/{-y}.jpeg",
    maxZoom: 19,
  },
};

export function isMapBaseLayerId(value: string): value is MapBaseLayerId {
  return (mapBaseLayerIds as readonly string[]).includes(value);
}
