export type WorkspaceBaseView = "map" | "places" | "compare";

export type WorkspaceDetailView = Readonly<{
  kind: "details";
  returnTo: WorkspaceBaseView;
}>;

export type WorkspacePrimaryView =
  | Readonly<{ kind: WorkspaceBaseView }>
  | WorkspaceDetailView;

export type WorkspaceView =
  | WorkspacePrimaryView
  | Readonly<{
      kind: "help";
      returnTo: WorkspacePrimaryView;
    }>;

export type WorkspaceExploreView =
  | Readonly<{ kind: "places" }>
  | Readonly<{ kind: "details"; returnTo: "places" }>;

type WorkspaceHistoryState = Readonly<{
  eclipseAtlasWorkspace?: WorkspaceView;
  eclipseAtlasExploreView?: WorkspaceExploreView;
  eclipseAtlasWorkspaceParentSteps?: number;
}>;

type WorkspaceHistoryOptions = Readonly<{
  exploreView?: WorkspaceExploreView;
  parentSteps?: number;
}>;

const VIEW_HASHES: Readonly<Record<WorkspaceView["kind"], string>> = {
  map: "#map",
  places: "#places",
  details: "#details",
  compare: "#comparison",
  help: "#help",
};

function isBaseView(value: unknown): value is WorkspaceBaseView {
  return value === "map" || value === "places" || value === "compare";
}

function isPrimaryView(value: unknown): value is WorkspacePrimaryView {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { kind?: unknown; returnTo?: unknown };
  if (isBaseView(candidate.kind)) return true;
  return candidate.kind === "details" && isBaseView(candidate.returnTo);
}

export function isWorkspaceView(value: unknown): value is WorkspaceView {
  if (isPrimaryView(value)) return true;
  if (!value || typeof value !== "object") return false;
  const candidate = value as { kind?: unknown; returnTo?: unknown };
  return candidate.kind === "help" && isPrimaryView(candidate.returnTo);
}

export function isWorkspaceExploreView(
  value: unknown,
): value is WorkspaceExploreView {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { kind?: unknown; returnTo?: unknown };
  return (
    candidate.kind === "places" ||
    (candidate.kind === "details" && candidate.returnTo === "places")
  );
}

function workspaceViewsEqual(left: WorkspaceView, right: WorkspaceView): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "details" && right.kind === "details") {
    return left.returnTo === right.returnTo;
  }
  if (left.kind === "help" && right.kind === "help") {
    return workspaceViewsEqual(left.returnTo, right.returnTo);
  }
  return true;
}

export function workspaceHash(view: WorkspaceView) {
  return VIEW_HASHES[view.kind];
}

export function workspaceHistoryState(
  existing: unknown,
  view: WorkspaceView,
  options: WorkspaceHistoryOptions = {},
): WorkspaceHistoryState & Record<string, unknown> {
  const base =
    existing && typeof existing === "object"
      ? (existing as Record<string, unknown>)
      : {};
  const retainsWorkspaceParent = view.kind === "details" || view.kind === "help";
  const storedView = (base as WorkspaceHistoryState).eclipseAtlasWorkspace;
  const existingParentSteps =
    isWorkspaceView(storedView) && workspaceViewsEqual(storedView, view)
      ? Math.max(
          0,
          (base as WorkspaceHistoryState).eclipseAtlasWorkspaceParentSteps ?? 0,
        )
      : 0;
  return {
    ...base,
    eclipseAtlasWorkspace: view,
    ...(options.exploreView
      ? { eclipseAtlasExploreView: options.exploreView }
      : {}),
    eclipseAtlasWorkspaceParentSteps: retainsWorkspaceParent
      ? (options.parentSteps ?? existingParentSteps)
      : 0,
  };
}

export function workspaceExploreViewFromLocation(
  view: WorkspaceView,
  hasSelection: boolean,
  historyState: unknown,
): WorkspaceExploreView {
  if (!hasSelection) return { kind: "places" };
  if (view.kind === "places") return { kind: "places" };
  if (view.kind === "details" && view.returnTo === "places") {
    return { kind: "details", returnTo: "places" };
  }

  const persisted =
    historyState && typeof historyState === "object"
      ? (historyState as WorkspaceHistoryState).eclipseAtlasExploreView
      : undefined;
  if (isWorkspaceExploreView(persisted)) return persisted;

  return { kind: "details", returnTo: "places" };
}

export function workspaceHistoryParentSteps(
  historyState: unknown,
  view: WorkspaceView,
) {
  if (
    (view.kind !== "details" && view.kind !== "help") ||
    historyState === null ||
    typeof historyState !== "object"
  ) {
    return 0;
  }
  const steps = (historyState as WorkspaceHistoryState)
    .eclipseAtlasWorkspaceParentSteps;
  return typeof steps === "number" && Number.isSafeInteger(steps) && steps > 0
    ? steps
    : 0;
}

export function workspaceHasHistoryParent(
  historyState: unknown,
  view: WorkspaceView,
) {
  return workspaceHistoryParentSteps(historyState, view) > 0;
}

export function workspaceViewFromLocation(
  hash: string,
  hasSelection: boolean,
  historyState: unknown,
): WorkspaceView {
  const persisted =
    historyState && typeof historyState === "object"
      ? (historyState as WorkspaceHistoryState).eclipseAtlasWorkspace
      : undefined;
  if (isWorkspaceView(persisted) && workspaceHash(persisted) === hash) {
    if (persisted.kind === "details") {
      if (hasSelection) return persisted;
    } else if (
      persisted.kind === "help" &&
      persisted.returnTo.kind === "details" &&
      !hasSelection
    ) {
      return { kind: "help", returnTo: { kind: "map" } };
    } else {
      return persisted;
    }
  }

  if (hash === VIEW_HASHES.places) return { kind: "places" };
  if (hash === VIEW_HASHES.compare) return { kind: "compare" };
  if (hash === VIEW_HASHES.details && hasSelection) {
    return { kind: "details", returnTo: "places" };
  }
  if (hash === VIEW_HASHES.help) {
    return { kind: "help", returnTo: { kind: "map" } };
  }
  return { kind: "map" };
}

export function primaryWorkspaceView(view: WorkspaceView): WorkspacePrimaryView {
  return view.kind === "help" ? view.returnTo : view;
}

export function workspaceSurface(view: WorkspaceView): "map" | "explore" | "help" {
  if (view.kind === "map") return "map";
  if (view.kind === "help") return "help";
  return "explore";
}

export function workspaceNavigationDestination(
  view: WorkspaceView,
): "map" | "explore" | "help" {
  if (view.kind === "help") return "help";
  if (view.kind === "map") return "map";
  if (view.kind === "details" && view.returnTo === "map") return "map";
  return "explore";
}

export function detailReturnView(view: WorkspaceView): WorkspaceBaseView {
  if (view.kind === "details") return view.returnTo;
  return "places";
}

export function viewAfterClearingSelection(view: WorkspaceView): WorkspaceView {
  if (view.kind === "details") return { kind: view.returnTo };
  if (view.kind === "help" && view.returnTo.kind === "details") {
    return { kind: view.returnTo.returnTo };
  }
  return view;
}
