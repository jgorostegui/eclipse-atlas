import { describe, expect, it } from "vitest";
import {
  detailReturnView,
  viewAfterClearingSelection,
  workspaceExploreViewFromLocation,
  workspaceHash,
  workspaceHasHistoryParent,
  workspaceHistoryParentSteps,
  workspaceHistoryState,
  workspaceNavigationDestination,
  workspaceSurface,
  workspaceViewFromLocation,
  type WorkspaceView,
} from "./workspace-navigation";

describe("workspace navigation", () => {
  it.each<[WorkspaceView, string]>([
    [{ kind: "map" }, "#map"],
    [{ kind: "places" }, "#places"],
    [{ kind: "details", returnTo: "map" }, "#details"],
    [{ kind: "compare" }, "#comparison"],
    [{ kind: "help", returnTo: { kind: "places" } }, "#help"],
  ])("serializes $kind", (view, expectedHash) => {
    expect(workspaceHash(view)).toBe(expectedHash);
  });

  it("restores the detail return destination from browser history", () => {
    const view: WorkspaceView = { kind: "details", returnTo: "places" };
    const state = workspaceHistoryState({ retained: true }, view, {
      parentSteps: 1,
    });

    expect(workspaceViewFromLocation("#details", true, state)).toEqual(view);
    expect(workspaceHasHistoryParent(state, view)).toBe(true);
    expect(workspaceHistoryParentSteps(state, view)).toBe(1);
    expect(state.retained).toBe(true);
  });

  it("does not invent a parent for a direct detail link", () => {
    const view: WorkspaceView = { kind: "details", returnTo: "places" };
    const state = workspaceHistoryState(null, view);

    expect(workspaceHasHistoryParent(state, view)).toBe(false);
  });

  it("opens a selected map location in the Explore detail by default", () => {
    expect(
      workspaceExploreViewFromLocation({ kind: "map" }, true, null),
    ).toEqual({ kind: "details", returnTo: "places" });
  });

  it("restores the explicit Explore list while keeping the selection", () => {
    const state = workspaceHistoryState(
      null,
      { kind: "map" },
      { exploreView: { kind: "places" } },
    );

    expect(
      workspaceExploreViewFromLocation({ kind: "map" }, true, state),
    ).toEqual({ kind: "places" });
  });

  it("restores the Explore detail after switching to the map", () => {
    const detail = { kind: "details", returnTo: "places" } as const;
    const state = workspaceHistoryState(
      null,
      { kind: "map" },
      { exploreView: detail },
    );

    expect(
      workspaceExploreViewFromLocation({ kind: "map" }, true, state),
    ).toEqual(detail);
  });

  it("resets Explore to the list when the selection is cleared", () => {
    const detail = { kind: "details", returnTo: "places" } as const;
    const state = workspaceHistoryState(
      null,
      { kind: "map" },
      { exploreView: detail },
    );

    expect(
      workspaceExploreViewFromLocation({ kind: "map" }, false, state),
    ).toEqual({ kind: "places" });
  });

  it("tracks the number of detail entries above their parent", () => {
    const view: WorkspaceView = { kind: "details", returnTo: "places" };
    const state = workspaceHistoryState(null, view, { parentSteps: 3 });

    expect(workspaceHistoryParentSteps(state, view)).toBe(3);
  });

  it("tracks Help as a reversible child of its opening view", () => {
    const view: WorkspaceView = {
      kind: "help",
      returnTo: { kind: "compare" },
    };
    const state = workspaceHistoryState(null, view, { parentSteps: 2 });

    expect(workspaceHistoryParentSteps(state, view)).toBe(2);
    expect(workspaceHasHistoryParent(state, view)).toBe(true);
  });

  it("does not restore details without a selected location", () => {
    const state = workspaceHistoryState(null, {
      kind: "details",
      returnTo: "places",
    });

    expect(workspaceViewFromLocation("#details", false, state)).toEqual({
      kind: "map",
    });
  });

  it("gives a direct detail link a usable places fallback", () => {
    expect(workspaceViewFromLocation("#details", true, null)).toEqual({
      kind: "details",
      returnTo: "places",
    });
  });

  it("does not let Help return to details without a selection", () => {
    const state = workspaceHistoryState(null, {
      kind: "help",
      returnTo: { kind: "details", returnTo: "places" },
    });

    const restored = workspaceViewFromLocation("#help", false, state);
    expect(restored).toEqual({
      kind: "help",
      returnTo: { kind: "map" },
    });
    expect(
      workspaceHistoryParentSteps(
        workspaceHistoryState(state, restored),
        restored,
      ),
    ).toBe(0);
  });

  it("falls back to the map for an invalid workspace hash", () => {
    expect(workspaceViewFromLocation("#unknown", false, null)).toEqual({
      kind: "map",
    });
  });

  it("keeps details on their parent mobile destination", () => {
    const mapDetail: WorkspaceView = { kind: "details", returnTo: "map" };
    const placeDetail: WorkspaceView = {
      kind: "details",
      returnTo: "places",
    };

    expect(workspaceSurface(mapDetail)).toBe("explore");
    expect(workspaceNavigationDestination(mapDetail)).toBe("map");
    expect(workspaceNavigationDestination(placeDetail)).toBe("explore");
  });

  it("returns details to their recorded origin without clearing selection", () => {
    expect(detailReturnView({ kind: "details", returnTo: "compare" })).toBe(
      "compare",
    );
    expect(
      viewAfterClearingSelection({ kind: "details", returnTo: "places" }),
    ).toEqual({ kind: "places" });
  });
});
