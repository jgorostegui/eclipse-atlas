export const eclipseEventIds = ["2026", "2027", "2028"] as const;
export type EclipseEventId = (typeof eclipseEventIds)[number];

export type BesselianElements = Readonly<{
  sourceId: string;
  producer: string;
  sourceUrl: string;
  retrievedAt: string;
  acknowledgment: string;
  sourceEphemerides: string;
  sourceDeltaTSeconds: number;
  referenceTdtHours: number;
  validityStartTdtHours: number;
  validityEndTdtHours: number;
  x: readonly [number, number, number, number];
  y: readonly [number, number, number, number];
  declinationDegrees: readonly [number, number, number];
  muDegrees: readonly [number, number, number];
  penumbraRadius: readonly [number, number, number];
  umbraRadius: readonly [number, number, number];
  tanPenumbraConeAngle: number;
  tanUmbraConeAngle: number;
}>;

export type EclipseEvent = Readonly<{
  id: EclipseEventId;
  date: string;
  year: number;
  monthIndex: number;
  day: number;
  expectedCentralPhase: "total" | "annular";
  centralShadowKind: "umbra" | "antumbra";
  besselian: BesselianElements;
  localCircumstancesSearchEndTdtHours: number;
  timeScale: Readonly<{
    deltaTSeconds: number;
    ttMinusUtcSeconds: number;
    source: "IERS Bulletin A" | "NASA/GSFC prediction";
    status: "event-specific prediction" | "long-range prediction";
  }>;
  officialOverview: Readonly<{
    directory: string;
    manifestFile: string;
    sourceDetailId: number;
  }>;
  forecastUtcHours: readonly number[];
  hasEventAlignedClimate: boolean;
}>;

const sharedBesselianSource = {
  producer: "Fred Espenak / NASA Goddard Space Flight Center",
  retrievedAt: "2026-08-03",
  acknowledgment: "Eclipse Predictions by Fred Espenak, NASA's GSFC",
  sourceEphemerides: "VSOP87/ELP2000-82",
} as const;

export const ECLIPSE_2026_BESSELIAN_ELEMENTS: BesselianElements = Object.freeze({
  ...sharedBesselianSource,
  sourceId: "nasa-gsfc-2026-besselian-elements",
  sourceUrl: "https://eclipse.gsfc.nasa.gov/SEsearch/SEdata.php?Ecl=20260812",
  retrievedAt: "2026-08-02",
  sourceDeltaTSeconds: 75.4,
  referenceTdtHours: 18,
  validityStartTdtHours: 15,
  validityEndTdtHours: 21,
  x: [0.47551399, 0.51892489, -0.0000773, -0.00000804] as const,
  y: [0.77118301, -0.230168, -0.0001246, 0.00000377] as const,
  declinationDegrees: [14.79666996, -0.012065, -0.000003] as const,
  muDegrees: [88.74778748, 15.0030899, 0] as const,
  penumbraRadius: [0.53795499, 0.0000939, -0.0000121] as const,
  umbraRadius: [-0.008142, 0.0000935, -0.0000121] as const,
  tanPenumbraConeAngle: 0.0046141,
  tanUmbraConeAngle: 0.0045911,
});

export const ECLIPSE_2027_BESSELIAN_ELEMENTS: BesselianElements = Object.freeze({
  ...sharedBesselianSource,
  sourceId: "nasa-gsfc-2027-besselian-elements",
  sourceUrl: "https://eclipse.gsfc.nasa.gov/SEsearch/SEdata.php?Ecl=20270802",
  sourceDeltaTSeconds: 76,
  referenceTdtHours: 10,
  validityStartTdtHours: 7,
  validityEndTdtHours: 13,
  x: [-0.019772, 0.5447123, -0.0000446, -0.0000092] as const,
  y: [0.160061, -0.2111582, -0.0001217, 0.0000038] as const,
  declinationDegrees: [17.7624702, -0.010181, -0.000004] as const,
  muDegrees: [328.422546, 15.0021, 0] as const,
  penumbraRadius: [0.530596, 0.0000138, -0.0000128] as const,
  umbraRadius: [-0.015464, 0.0000137, -0.0000128] as const,
  tanPenumbraConeAngle: 0.0046064,
  tanUmbraConeAngle: 0.0045834,
});

export const ECLIPSE_2028_BESSELIAN_ELEMENTS: BesselianElements = Object.freeze({
  ...sharedBesselianSource,
  sourceId: "nasa-gsfc-2028-besselian-elements",
  sourceUrl: "https://eclipse.gsfc.nasa.gov/SEsearch/SEdata.php?Ecl=20280126",
  sourceDeltaTSeconds: 76.3,
  referenceTdtHours: 15,
  validityStartTdtHours: 12,
  validityEndTdtHours: 18,
  x: [-0.205283, 0.474257, -0.000039, -0.0000053] as const,
  y: [0.34028, 0.1738587, 0.0000968, -0.0000021] as const,
  declinationDegrees: [-18.7282505, 0.010074, 0.000005] as const,
  muDegrees: [41.891281, 14.99896, 0] as const,
  penumbraRadius: [0.574117, 0.000042, -0.0000099] as const,
  umbraRadius: [0.02784, 0.0000418, -0.0000099] as const,
  tanPenumbraConeAngle: 0.0047501,
  tanUmbraConeAngle: 0.0047264,
});

export const eclipseEvents: Readonly<Record<EclipseEventId, EclipseEvent>> = {
  "2026": {
    id: "2026",
    date: "2026-08-12",
    year: 2026,
    monthIndex: 7,
    day: 12,
    expectedCentralPhase: "total",
    centralShadowKind: "umbra",
    besselian: ECLIPSE_2026_BESSELIAN_ELEMENTS,
    localCircumstancesSearchEndTdtHours: 21,
    timeScale: {
      deltaTSeconds: 69.17309,
      ttMinusUtcSeconds: 69.184,
      source: "IERS Bulletin A",
      status: "event-specific prediction",
    },
    officialOverview: {
      directory: "map-overlays/v1",
      manifestFile: "official-eclipse-overlays-v1.json",
      sourceDetailId: 12631995,
    },
    forecastUtcHours: [17, 18, 19, 20],
    hasEventAlignedClimate: true,
  },
  "2027": {
    id: "2027",
    date: "2027-08-02",
    year: 2027,
    monthIndex: 7,
    day: 2,
    expectedCentralPhase: "total",
    centralShadowKind: "umbra",
    besselian: ECLIPSE_2027_BESSELIAN_ELEMENTS,
    localCircumstancesSearchEndTdtHours: 13,
    timeScale: {
      deltaTSeconds: 76,
      ttMinusUtcSeconds: 76,
      source: "NASA/GSFC prediction",
      status: "long-range prediction",
    },
    officialOverview: {
      directory: "map-overlays/2027",
      manifestFile: "official-eclipse-overlays.json",
      sourceDetailId: 12643911,
    },
    forecastUtcHours: [7, 8, 9, 10],
    hasEventAlignedClimate: false,
  },
  "2028": {
    id: "2028",
    date: "2028-01-26",
    year: 2028,
    monthIndex: 0,
    day: 26,
    expectedCentralPhase: "annular",
    centralShadowKind: "antumbra",
    besselian: ECLIPSE_2028_BESSELIAN_ELEMENTS,
    // The eclipse leaves Spain just after the six-hour coefficient-fit interval.
    // A 15-minute continuation is needed to retain C4 for western Spain.
    localCircumstancesSearchEndTdtHours: 18.25,
    timeScale: {
      deltaTSeconds: 76.3,
      ttMinusUtcSeconds: 76.3,
      source: "NASA/GSFC prediction",
      status: "long-range prediction",
    },
    officialOverview: {
      directory: "map-overlays/2028",
      manifestFile: "official-eclipse-overlays.json",
      sourceDetailId: 12643914,
    },
    forecastUtcHours: [15, 16, 17, 18],
    hasEventAlignedClimate: false,
  },
};

export const DEFAULT_ECLIPSE_EVENT_ID: EclipseEventId = "2026";

export function isEclipseEventId(value: string): value is EclipseEventId {
  return (eclipseEventIds as readonly string[]).includes(value);
}

export function eclipseEvent(eventId: EclipseEventId) {
  return eclipseEvents[eventId];
}
