import {
  officialOverviewSelectionIds,
  type OfficialOverviewSelection,
} from "./official-overview";

export const atmosphereMapViewIds = [
  "august-cloud-climate",
  "eclipse-day-cloud-forecast",
] as const;

export const mapViewSelectionIds = [
  ...officialOverviewSelectionIds,
  ...atmosphereMapViewIds,
] as const;

export type AtmosphereMapView = (typeof atmosphereMapViewIds)[number];
export type MapViewSelection =
  | OfficialOverviewSelection
  | AtmosphereMapView;

const officialOverviewSelectionSet = new Set<string>([
  "none",
  ...officialOverviewSelectionIds,
]);
const atmosphereMapViewSet = new Set<string>(atmosphereMapViewIds);

export function isOfficialOverviewSelection(
  value: MapViewSelection,
): value is OfficialOverviewSelection {
  return officialOverviewSelectionSet.has(value);
}

export function isAtmosphereMapView(
  value: MapViewSelection,
): value is AtmosphereMapView {
  return atmosphereMapViewSet.has(value);
}
