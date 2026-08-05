export const selectedPlaceEvidenceViews = [
  "horizon",
  "clouds",
] as const;

export type SelectedPlaceEvidenceView =
  (typeof selectedPlaceEvidenceViews)[number];

export function selectedPlaceTabId(view: SelectedPlaceEvidenceView) {
  return `selected-place-tab-${view}`;
}

export function selectedPlacePanelId(view: SelectedPlaceEvidenceView) {
  return `selected-place-panel-${view}`;
}
