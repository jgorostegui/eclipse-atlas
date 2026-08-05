import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { candidates } from "../../data/candidates";
import { calculateEclipseCircumstances } from "../../domain/eclipse";
import {
  calculateTerrainHorizon,
  TerrainHorizonError,
  type TerrainHorizon,
} from "../../domain/terrain-horizon";
import { I18nProvider } from "../../i18n/I18nProvider";
import { TerrainProfile } from "./TerrainProfile";

vi.mock("../../domain/terrain-horizon", async () => {
  const actual = await vi.importActual<
    typeof import("../../domain/terrain-horizon")
  >("../../domain/terrain-horizon");
  return { ...actual, calculateTerrainHorizon: vi.fn() };
});

vi.mock("./HorizonAnimation", () => ({
  HorizonAnimation: () => <div>Rendered horizon</div>,
}));

const location = candidates.find(({ id }) => id === "soria")!;
const eclipse = calculateEclipseCircumstances(
  location.latitude,
  location.longitude,
  { groundElevationMetres: 500, viewpointHeightAboveGroundMetres: 1.5 },
  "2026",
)!;
const horizon = {
  solarDiscAssessment: null,
} as TerrainHorizon;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
});

function renderProfile(
  props: Partial<ComponentProps<typeof TerrainProfile>> = {},
) {
  return render(
    <I18nProvider>
      <TerrainProfile
        location={location}
        eventId="2026"
        eclipse={eclipse}
        elevationStatus="ready"
        {...props}
      />
    </I18nProvider>,
  );
}

describe("TerrainProfile recovery", () => {
  it("retries a failed horizon calculation in place", async () => {
    vi.mocked(calculateTerrainHorizon)
      .mockRejectedValueOnce(
        new TerrainHorizonError("network", "Temporary network failure"),
      )
      .mockResolvedValueOnce(horizon);
    const user = userEvent.setup();
    renderProfile();

    await user.click(await screen.findByRole("button", { name: "Try again" }));

    await waitFor(() =>
      expect(calculateTerrainHorizon).toHaveBeenCalledTimes(2),
    );
    expect(await screen.findByText("Rendered horizon")).toBeTruthy();
  });

  it("delegates an observer elevation retry to the planner", async () => {
    const onRetryElevation = vi.fn();
    const user = userEvent.setup();
    renderProfile({
      eclipse: null,
      elevationStatus: "error",
      onRetryElevation,
    });

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(onRetryElevation).toHaveBeenCalledOnce();
    expect(calculateTerrainHorizon).not.toHaveBeenCalled();
  });
});
