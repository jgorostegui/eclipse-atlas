import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import EclipsePlanner from "./EclipsePlanner";
import cloudClimateArtifact from "../../../public/climate/v1/august-cloud-cover-era5-v1.json" with {
  type: "json",
};

const SORIA_REFERENCE = "place:soria";
const CUSTOM_POINT_REFERENCE = "geo:41.763600,-2.464900";

vi.mock("../horizon/TerrainProfile", () => ({
  TerrainProfile: () => <div>Terrain profile placeholder</div>,
}));

vi.mock("../../domain/terrain-horizon", async () => {
  const actual = await vi.importActual<
    typeof import("../../domain/terrain-horizon")
  >("../../domain/terrain-horizon");
  return {
    ...actual,
    calculateTerrainElevation: vi.fn(
      async (latitude: number, longitude: number) => ({
        elevationMetres: 500,
        source: "IGN/CNIG TerrainRGB" as const,
        zoom: 11 as const,
        address: actual.terrainPixelAddress(latitude, longitude, 11),
      }),
    ),
  };
});

vi.mock("../../domain/weather", async () => {
  const actual = await vi.importActual<typeof import("../../domain/weather")>(
    "../../domain/weather",
  );
  return {
    ...actual,
    // Keep the clouds panel inert. This test only cares about which tab is
    // active, not about forecast content, so there is no reason to fan out
    // into real supplemental-model work.
    fetchSupplementalCloudForecast: vi.fn(async () => null),
  };
});

// Stand in for the Leaflet map, which does not render under jsdom. The button
// changes the selected place to a deterministic custom point.
vi.mock("../map/EclipseMap", () => ({
  EclipseMap: ({
    onPick,
  }: {
    onPick: (latitude: number, longitude: number) => void;
  }) => (
    <button type="button" onClick={() => onPick(41.7636, -2.4649)}>
      Pick scenario point
    </button>
  ),
}));

function plannerUrl(parameters: string[]) {
  const search = new URLSearchParams([
    ["state", "1"],
    ["lang", "en"],
  ]);
  for (const parameter of parameters) {
    const separator = parameter.indexOf("=");
    search.append(parameter.slice(0, separator), parameter.slice(separator + 1));
  }
  return `/?${search.toString()}`;
}

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify(cloudClimateArtifact), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("selected-place evidence lens", () => {
  it("stays on the reader's chosen tab when the selection changes", async () => {
    window.history.replaceState(
      null,
      "",
      plannerUrl([`selected=${SORIA_REFERENCE}`, "layer=none"]),
    );
    const user = userEvent.setup({ delay: null });
    render(
      <I18nProvider>
        <EclipsePlanner />
      </I18nProvider>,
    );

    const clouds = await screen.findByRole("tab", { name: "Clouds" });
    await user.click(clouds);
    expect(clouds.getAttribute("aria-selected")).toBe("true");

    // Change the selected place. The lens must not snap back to horizon.
    await user.click(
      screen.getByRole("button", { name: "Pick scenario point" }),
    );
    await waitFor(() =>
      expect(decodeURIComponent(window.location.search)).toContain(
        `selected=${CUSTOM_POINT_REFERENCE}`,
      ),
    );
    expect(
      screen.getByRole("tab", { name: "Clouds" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      screen
        .getByRole("tab", { name: "Horizon" })
        .getAttribute("aria-selected"),
    ).toBe("false");
  });
});
