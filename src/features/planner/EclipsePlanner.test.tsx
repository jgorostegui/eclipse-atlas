import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { I18nProvider } from "../../i18n/I18nProvider";
import { calculateTerrainElevation } from "../../domain/terrain-horizon";
import EclipsePlanner from "./EclipsePlanner";
import cloudClimateArtifact from "../../../public/climate/v1/august-cloud-cover-era5-v1.json" with {
  type: "json",
};

const ACCEPTANCE_SCENARIO = {
  customPoint: {
    latitude: 41.7636,
    longitude: -2.4649,
    reference: "geo:41.763600,-2.464900",
  },
  secondCustomPoint: {
    latitude: 41.763601,
    longitude: -2.464901,
    reference: "geo:41.763601,-2.464901",
  },
  saved: {
    soria: "place:soria",
    burgos: "place:burgos",
    bardenas: "place:el-ferial",
    arguedas: "place:arguedas",
    aCoruna: "place:a-coruna",
    adanero: "place:jcyl-05001-adanero",
    ceuta: "place:ceuta",
  },
  syntheticGroundElevationMetres: 500,
  unsupportedPoint: {
    latitude: 51.5,
    longitude: -0.1,
  },
} as const;

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

function mixedComparisonUrl() {
  return plannerUrl([
    `selected=${ACCEPTANCE_SCENARIO.saved.soria}`,
    `compare=${ACCEPTANCE_SCENARIO.saved.soria}`,
    `compare=${ACCEPTANCE_SCENARIO.saved.burgos}`,
    `compare=${ACCEPTANCE_SCENARIO.saved.bardenas}`,
    "layer=none",
  ]);
}

vi.mock("../../domain/terrain-horizon", async () => {
  const actual = await vi.importActual<
    typeof import("../../domain/terrain-horizon")
  >("../../domain/terrain-horizon");
  return {
    ...actual,
    calculateTerrainElevation: vi.fn(
      async (latitude: number, longitude: number) => ({
        elevationMetres: ACCEPTANCE_SCENARIO.syntheticGroundElevationMetres,
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
    fetchEclipseDayForecast: vi.fn(
      async (
        locations: ReadonlyArray<{
          id: string;
          latitude: number;
          longitude: number;
        }>,
      ) => ({
        model: "ECMWF IFS HRES" as const,
        nominalResolutionKilometres: 9 as const,
        run: {
          initializedAt: new Date("2026-08-03T00:00:00.000Z"),
          availableAt: new Date("2026-08-03T04:00:00.000Z"),
          dataEndsAt: new Date("2026-08-15T00:00:00.000Z"),
        },
        retrievedAt: new Date("2026-08-03T05:00:00.000Z"),
        sourceMode: "exact-run" as const,
        forecasts: locations.map((location) => ({
          locationId: location.id,
          requestedCoordinate: {
            latitude: location.latitude,
            longitude: location.longitude,
          },
          serviceCoordinate: {
            latitude: location.latitude,
            longitude: location.longitude,
            downscalingElevationMetres: 500,
          },
          hours: [
            {
              validAt: new Date("2026-08-12T17:00:00.000Z"),
              cloudCoverPercent: 25,
              lowCloudCoverPercent: 8,
              midCloudCoverPercent: 12,
              highCloudCoverPercent: 10,
              precipitationMillimetres: 0,
              windSpeedKilometresPerHour: 14,
              windGustsKilometresPerHour: 28,
            },
            {
              validAt: new Date("2026-08-12T18:00:00.000Z"),
              cloudCoverPercent: 20,
              lowCloudCoverPercent: 5,
              midCloudCoverPercent: 10,
              highCloudCoverPercent: 8,
              precipitationMillimetres: 0,
              windSpeedKilometresPerHour: 12,
              windGustsKilometresPerHour: 25,
            },
            {
              validAt: new Date("2026-08-12T19:00:00.000Z"),
              cloudCoverPercent: 30,
              lowCloudCoverPercent: 10,
              midCloudCoverPercent: 12,
              highCloudCoverPercent: 15,
              precipitationMillimetres: 0,
              windSpeedKilometresPerHour: 10,
              windGustsKilometresPerHour: 22,
            },
            {
              validAt: new Date("2026-08-12T20:00:00.000Z"),
              cloudCoverPercent: 35,
              lowCloudCoverPercent: 12,
              midCloudCoverPercent: 15,
              highCloudCoverPercent: 18,
              precipitationMillimetres: 0,
              windSpeedKilometresPerHour: 9,
              windGustsKilometresPerHour: 20,
            },
          ] as const,
        })),
      }),
    ),
  };
});

vi.mock("../map/EclipseMap", () => ({
  EclipseMap: ({
    onPick,
    onSelect,
  }: {
    onPick: (latitude: number, longitude: number) => void;
    onSelect: (id: string) => void;
  }) => (
    <div>
      <button
        onClick={() =>
          onPick(
            ACCEPTANCE_SCENARIO.customPoint.latitude,
            ACCEPTANCE_SCENARIO.customPoint.longitude,
          )
        }
      >
        Pick scenario point
      </button>
      <button onClick={() => onSelect("arguedas")}>Select Arguedas</button>
    </div>
  ),
}));

vi.mock("../horizon/TerrainProfile", () => ({
  TerrainProfile: ({
    elevationStatus,
    onRetryElevation,
  }: {
    elevationStatus: "loading" | "ready" | "error";
    onRetryElevation?: () => void;
  }) => (
    <div>
      Terrain profile placeholder
      {elevationStatus === "error" && (
        <button type="button" onClick={onRetryElevation}>
          Retry elevation
        </button>
      )}
    </div>
  ),
}));

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

function renderLab() {
  return render(
    <I18nProvider>
      <EclipsePlanner />
    </I18nProvider>,
  );
}

function renderLabInStrictMode() {
  return render(
    <StrictMode>
      <I18nProvider>
        <EclipsePlanner />
      </I18nProvider>
    </StrictMode>,
  );
}

describe("EclipsePlanner acceptance", () => {
  it("opens map-first without a safety banner or opaque score", () => {
    renderLab();
    const desktopTools = screen.getByRole("complementary", {
      name: "Eclipse map tools",
    });

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /Spanish solar eclipse planning map/i,
      }),
    ).toBeTruthy();
    expect(screen.getByText(/Choose a place or click anywhere on the map/i)).toBeTruthy();
    expect(screen.getByText("1,086 places · 124 shown")).toBeTruthy();
    expect(screen.getByRole("searchbox", { name: /Search the map places/i })).toBeTruthy();
    expect(
      within(desktopTools).getByRole("button", { name: "Totality duration" }),
    ).toBeTruthy();
    expect(screen.queryByText(/ISO 12312-2|eye protection|solar filters/i)).toBeNull();
    expect(screen.queryByText(/puntuación|magic score|\/100/i)).toBeNull();
    expect(desktopTools).toBeTruthy();
    expect(screen.getByRole("button", { name: "Compare 0" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Data and sources" })).toBeTruthy();
    expect(calculateTerrainElevation).not.toHaveBeenCalled();
  });

  it("treats focused place search as an explicit reversible state", async () => {
    const user = userEvent.setup();
    renderLab();
    const shell = document.querySelector<HTMLElement>(".planner-shell");
    const search = screen.getByRole("searchbox", {
      name: "Search the map places",
    }) as HTMLInputElement;

    await user.click(search);
    expect(shell?.dataset.searchActive).toBe("true");

    await user.type(search, "Burg");
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(search.value).toBe("");
    expect(document.activeElement).toBe(search);
    expect(shell?.dataset.searchActive).toBe("true");

    await user.type(search, "Burgos");
    await user.click(screen.getByRole("button", { name: "Close search" }));
    expect(search.value).toBe("");
    expect(document.activeElement).not.toBe(search);
    expect(shell?.hasAttribute("data-search-active")).toBe(false);
  });

  it("restores a named Soria, Burgos and Bardenas deep link", async () => {
    window.history.replaceState(null, "", mixedComparisonUrl());
    const user = userEvent.setup();
    renderLab();

    expect(
      screen.getByRole("heading", {
        name: /^Soria$/i,
      }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Compare 3" }));
    expect(
      screen.getByRole("article", { name: /Comparison details for Soria/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("article", {
        name: /Comparison details for Burgos/i,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("article", {
        name: /Comparison details for El Ferial/i,
      }),
    ).toBeTruthy();

    await waitFor(() =>
      expect(window.location.search).toContain(
        encodeURIComponent(ACCEPTANCE_SCENARIO.saved.soria),
      ),
    );
  });

  it("prioritizes the selected-point outcome and keeps technical facts available", async () => {
    window.history.replaceState(
      null,
      "",
      plannerUrl([
        `selected=${ACCEPTANCE_SCENARIO.saved.soria}`,
        "layer=none",
      ]),
    );
    renderLab();

    const facts = screen.getByRole("region", {
      name: "Eclipse data for the selected point",
    });
    await waitFor(() => expect(within(facts).getByText("100%")).toBeTruthy());
    expect(within(facts).getByText("Total eclipse")).toBeTruthy();
    expect(
      facts.querySelector(".eclipse-outcome__context > strong")?.textContent,
    ).toMatch(/totality · 1 min 42 s/i);
    expect(within(facts).getByText(/Maximum · 20:29:58 CEST/i)).toBeTruthy();

    const technicalFacts = screen.getByRole("region", {
      name: "Technical eclipse data",
    });
    await waitFor(() =>
      expect(within(technicalFacts).getByText("500 m")).toBeTruthy(),
    );
    const magnitude = within(technicalFacts)
      .getByText("magnitude")
      .closest(".metric");
    expect(magnitude?.querySelector("strong")?.textContent).toMatch(
      /^\d\.\d{4}$/,
    );
    expect(within(technicalFacts).getByText("Sun at maximum")).toBeTruthy();
    expect(within(technicalFacts).getByText("ground elevation")).toBeTruthy();
    const technicalDetails = technicalFacts.closest<HTMLElement>(
      ".technical-facts",
    );
    if (!technicalDetails) throw new Error("Expected technical facts container.");
    expect(within(technicalDetails).getByText(/IGN\/CNIG TerrainRGB · zoom 11/)).toBeTruthy();
    expect(within(technicalDetails).getByText(/Ground elevation \+ 1\.5 m/)).toBeTruthy();
    expect(screen.queryByText(/score|\/100/i)).toBeNull();
  });

  it("returns details to the explorer without losing its working state", async () => {
    const user = userEvent.setup();
    renderLab();
    const search = screen.getByRole("searchbox", {
      name: "Search the map places",
    }) as HTMLInputElement;
    await user.type(search, "Soria");
    const soria = document.querySelector<HTMLButtonElement>(
      '.place-list button[data-candidate-id="soria"]',
    );
    if (!soria) throw new Error("Expected Soria in the explorer.");

    await user.click(soria);
    expect(window.location.hash).toBe("#details");
    expect(
      screen.getByRole("heading", { name: "Soria" }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Back to places" }),
    );

    expect(search.value).toBe("Soria");
    expect(soria.getAttribute("aria-current")).toBe("true");
    await waitFor(() => expect(document.activeElement).toBe(soria));
    expect(window.location.hash).toBe("#places");
    expect(decodeURIComponent(window.location.search)).toContain(
      `selected=${ACCEPTANCE_SCENARIO.saved.soria}`,
    );

    await user.click(soria);
    await user.click(
      screen.getByRole("button", { name: "Clear selection" }),
    );
    expect(search.value).toBe("Soria");
    expect(soria.hasAttribute("aria-current")).toBe(false);
    expect(window.location.search).not.toContain("selected=");
    expect(window.location.hash).toBe("#places");
  });

  it("keeps two custom comparison points visually distinguishable", () => {
    window.history.replaceState(
      null,
      "",
      plannerUrl([
        `selected=${ACCEPTANCE_SCENARIO.customPoint.reference}`,
        `compare=${ACCEPTANCE_SCENARIO.customPoint.reference}`,
        `compare=${ACCEPTANCE_SCENARIO.secondCustomPoint.reference}`,
        "layer=none",
      ]),
    );
    renderLab();

    fireEvent.click(screen.getByRole("button", { name: "Compare 2" }));

    expect(
      screen.getByRole("article", { name: /Custom point 41\.763600, -2\.464900/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("article", { name: /Custom point 41\.763601, -2\.464901/i }),
    ).toBeTruthy();
    expect(screen.getAllByText("41.763600, -2.464900").length).toBeGreaterThan(0);
    expect(screen.getAllByText("41.763601, -2.464901").length).toBeGreaterThan(0);
  });

  it("creates a deterministic custom-point URL from the map and restores it", async () => {
    const user = userEvent.setup();
    const { unmount } = renderLab();

    await user.click(screen.getByRole("button", { name: "Pick scenario point" }));
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    expect(window.location.search).toContain("state=1");
    expect(decodeURIComponent(window.location.search)).toContain(
      `selected=${ACCEPTANCE_SCENARIO.customPoint.reference}`,
    );
    expect(
      screen.getByRole("heading", { name: /Custom point 41\.76360/i }),
    ).toBeTruthy();
    unmount();

    renderLab();
    expect(
      screen.getByRole("heading", { name: /Custom point 41\.76360/i }),
    ).toBeTruthy();
  });

  it("creates the same deterministic point from the coordinate form", async () => {
    const user = userEvent.setup();
    renderLab();

    await user.type(
      screen.getByLabelText("Latitude"),
      String(ACCEPTANCE_SCENARIO.customPoint.latitude),
    );
    await user.type(
      screen.getByLabelText("Longitude"),
      String(ACCEPTANCE_SCENARIO.customPoint.longitude),
    );
    await user.click(
      screen.getByRole("button", { name: "Analyse coordinates" }),
    );

    expect(decodeURIComponent(window.location.search)).toContain(
      `selected=${ACCEPTANCE_SCENARIO.customPoint.reference}`,
    );
    expect(
      screen.getByRole("heading", { name: /Custom point 41\.76360/i }),
    ).toBeTruthy();
  });

  it("blocks a fourth comparison until one point is removed", async () => {
    const url = mixedComparisonUrl().replace(
      `selected=${encodeURIComponent(ACCEPTANCE_SCENARIO.saved.soria)}`,
      `selected=${encodeURIComponent(ACCEPTANCE_SCENARIO.saved.aCoruna)}`,
    );
    window.history.replaceState(null, "", url);
    const user = userEvent.setup();
    renderLab();

    await user.click(screen.getByRole("button", { name: "+ Add to comparison" }));
    expect(
      screen.getByText(/Three points are already in the comparison/i),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Compare 3" }));
    expect(
      screen.queryByRole("article", { name: /Comparison details for A Coruña/i }),
    ).toBeNull();

    const burgosCard = screen.getByRole("article", {
      name: /Comparison details for Burgos/i,
    });
    await user.click(
      within(burgosCard).getByRole("button", {
        name: /Remove Burgos from the comparison/i,
      }),
    );
    expect(screen.getByRole("button", { name: "Compare 2" })).toBeTruthy();
    await user.click(
      within(
        screen.getByRole("navigation", { name: "Primary navigation" }),
      ).getByRole("button", { name: "Explore" }),
    );
    expect(
      screen.getByRole("heading", { name: "A Coruña" }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Back to places" }),
    );
    await user.type(
      screen.getByRole("searchbox", { name: "Search the map places" }),
      "A Coruña",
    );
    const selectedPlace = document.querySelector<HTMLButtonElement>(
      '.place-list button[data-candidate-id="a-coruna"]',
    );
    if (!selectedPlace) throw new Error("Expected selected place in explorer.");
    await user.click(selectedPlace);
    await user.click(screen.getByRole("button", { name: "+ Add to comparison" }));
    expect(screen.getByRole("button", { name: "Compare 3" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Compare 3" }));
    expect(
      screen.getByRole("article", { name: /Comparison details for A Coruña/i }),
    ).toBeTruthy();
  });

  it("restores selection and layer through real back and forward navigation", async () => {
    window.history.replaceState(
      null,
      "",
      plannerUrl([
        `selected=${ACCEPTANCE_SCENARIO.saved.burgos}`,
        "layer=none",
      ]),
    );
    const user = userEvent.setup();
    renderLab();
    expect(
      screen.getByRole("heading", { name: /^Burgos$/i }),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Select Arguedas" }));
    await user.click(screen.getByRole("button", { name: "Solar altitude" }));
    expect(decodeURIComponent(window.location.search)).toContain(
      "layer=solar-altitude-at-maximum",
    );

    window.history.back();
    await waitFor(() =>
      expect(decodeURIComponent(window.location.search)).toContain("layer=none"),
    );
    expect(
      screen.getByRole("heading", { name: /^Arguedas$/i }),
    ).toBeTruthy();

    window.history.back();
    expect(
      await screen.findByRole("heading", {
        name: /^Burgos$/i,
      }),
    ).toBeTruthy();

    window.history.forward();
    expect(
      await screen.findByRole("heading", { name: /^Arguedas$/i }),
    ).toBeTruthy();
  });

  it("keeps an explicitly selected official 2026 site visible for another eclipse", async () => {
    window.history.replaceState(
      null,
      "",
      plannerUrl([
        `selected=${ACCEPTANCE_SCENARIO.saved.adanero}`,
        `compare=${ACCEPTANCE_SCENARIO.saved.adanero}`,
        "layer=none",
      ]),
    );
    const user = userEvent.setup();
    renderLab();

    expect(screen.getByRole("heading", { name: /^Adanero$/i })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Choose eclipse" }));
    await user.click(screen.getByRole("button", { name: /2027/ }));

    expect(
      await screen.findByRole("heading", { name: /^Adanero$/i }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Compare 1" })).toBeTruthy();
    const url = new URL(window.location.href);
    expect(url.searchParams.get("selected")).toBe(
      ACCEPTANCE_SCENARIO.saved.adanero,
    );
    expect(url.searchParams.getAll("compare")).toEqual([
      ACCEPTANCE_SCENARIO.saved.adanero,
    ]);
    expect(url.searchParams.get("event")).toBe("2027");
  });

  it("never renders a pending elevation response with the previous eclipse", async () => {
    let resolveElevation!: (
      value: Awaited<ReturnType<typeof calculateTerrainElevation>>,
    ) => void;
    vi.mocked(calculateTerrainElevation).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveElevation = resolve;
        }),
    );
    window.history.replaceState(
      null,
      "",
      plannerUrl([
        `selected=${ACCEPTANCE_SCENARIO.saved.ceuta}`,
        "layer=none",
      ]),
    );
    const user = userEvent.setup();
    const { container } = renderLab();
    const observedOutcomes: string[] = [];
    const observer = new MutationObserver(() => {
      observedOutcomes.push(
        container.querySelector(".eclipse-outcome")?.textContent ?? "",
      );
    });
    observer.observe(container, { childList: true, subtree: true, characterData: true });

    await user.click(screen.getByRole("button", { name: "Choose eclipse" }));
    await user.click(screen.getByRole("button", { name: /2027/ }));
    await act(async () => {
      resolveElevation({
        elevationMetres: ACCEPTANCE_SCENARIO.syntheticGroundElevationMetres,
        source: "IGN/CNIG TerrainRGB",
        zoom: 11,
        address: { tileX: 0, tileY: 0, pixelX: 0, pixelY: 0 },
      });
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(
        screen.getByRole("region", {
          name: "Eclipse data for the selected point",
        }).textContent,
      ).toContain("4 min 48 s"),
    );
    observer.disconnect();
    expect(observedOutcomes.join(" ")).not.toContain("92.6%");
    expect(observedOutcomes.join(" ")).not.toContain("20:39:50");
  });

  it("allows a failed observer elevation request to be retried", async () => {
    vi.mocked(calculateTerrainElevation).mockRejectedValueOnce(
      new Error("Temporary terrain failure"),
    );
    window.history.replaceState(
      null,
      "",
      plannerUrl([
        `selected=${ACCEPTANCE_SCENARIO.saved.soria}`,
        "layer=none",
      ]),
    );
    const user = userEvent.setup();
    renderLab();

    await user.click(
      await screen.findByRole("button", { name: "Retry elevation" }),
    );

    await waitFor(() =>
      expect(calculateTerrainElevation).toHaveBeenCalledTimes(2),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("region", {
          name: "Eclipse data for the selected point",
        }).textContent,
      ).toContain("100%"),
    );
  });

  it("does not add a dead history entry when a selected reference is selected again", async () => {
    const user = userEvent.setup();
    const pushState = vi.spyOn(window.history, "pushState");
    renderLab();

    const arguedas = screen.getByRole("button", { name: "Select Arguedas" });
    await user.click(arguedas);
    expect(pushState).toHaveBeenCalledTimes(1);
    await user.click(arguedas);
    expect(pushState).toHaveBeenCalledTimes(1);
  });

  it("keeps canonical state in the live URL without a global share control", async () => {
    window.history.replaceState(null, "", mixedComparisonUrl());
    const user = userEvent.setup();
    renderLab();
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
    const liveUrl = new URL(window.location.href);
    expect(liveUrl.searchParams.get("state")).toBe("1");
    expect(liveUrl.searchParams.get("selected")).toBe(
      ACCEPTANCE_SCENARIO.saved.soria,
    );
    expect(liveUrl.searchParams.getAll("compare")).toEqual([
      ACCEPTANCE_SCENARIO.saved.soria,
      ACCEPTANCE_SCENARIO.saved.burgos,
      ACCEPTANCE_SCENARIO.saved.bardenas,
    ]);
    expect(liveUrl.searchParams.get("layer")).toBe("none");
    expect(liveUrl.hash).toBe("#map");

    await user.click(screen.getByRole("button", { name: "Compare 3" }));
    await waitFor(() => expect(window.location.hash).toBe("#comparison"));
    expect(new URL(window.location.href).hash).toBe("#comparison");
  });

  it("restores an initial map hash under React StrictMode", async () => {
    window.history.replaceState(
      null,
      "",
      `${plannerUrl([
        `selected=${ACCEPTANCE_SCENARIO.saved.soria}`,
        "layer=none",
      ])}#map`,
    );
    renderLabInStrictMode();

    await waitFor(() =>
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled(),
    );
  });

  it("opens comparison details with a coherent return path", async () => {
    window.history.replaceState(null, "", `${mixedComparisonUrl()}#comparison`);
    const user = userEvent.setup();
    renderLab();
    await waitFor(() =>
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled(),
    );
    vi.mocked(Element.prototype.scrollIntoView).mockClear();

    const soriaComparison = screen.getByRole("article", {
      name: /Comparison details for Soria/i,
    });
    await user.click(
      within(soriaComparison).getByRole("button", {
        name: /Open details for Soria/i,
      }),
    );
    expect(window.location.hash).toBe("#details");
    expect(
      screen.getByRole("button", { name: /Back to comparison/i }),
    ).toBeTruthy();
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("normalizes invalid URL values and reports that they were ignored", () => {
    window.history.replaceState(
      null,
      "",
      "/?state=1&lang=en&selected=geo:51.5,-0.1&compare=place:missing&layer=score",
    );
    renderLab();

    expect(
      screen.getByText(/Ignored 3 invalid or unsupported link values/i),
    ).toBeTruthy();
    expect(screen.getByRole("complementary")).toBeTruthy();
    expect(decodeURIComponent(window.location.search)).not.toContain("score");
  });

  it("canonicalizes invalid planner state reached through history", async () => {
    renderLab();
    window.history.pushState(
      null,
      "",
      "/?state=1&lang=en&selected=place:missing&layer=score",
    );
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(
      await screen.findByText(/Ignored 2 invalid or unsupported link values/i),
    ).toBeTruthy();
    expect(decodeURIComponent(window.location.search)).not.toContain("missing");
    expect(decodeURIComponent(window.location.search)).not.toContain("score");
  });

  it("keeps both locales complete for the primary workflow", () => {
    window.history.replaceState(null, "", "/?state=1&lang=es&layer=none");
    renderLab();

    expect(
      screen.getByRole("heading", {
        name: /Mapa de planificación de eclipses solares en España/i,
      }),
    ).toBeTruthy();
    expect(screen.queryByText("Comparar 0/3")).toBeNull();
    expect(screen.getByRole("button", { name: "Analizar coordenadas" })).toBeTruthy();
  });

  it("rejects coordinates outside supported terrain coverage", () => {
    renderLab();
    fireEvent.change(screen.getByLabelText("Latitude"), {
      target: { value: String(ACCEPTANCE_SCENARIO.unsupportedPoint.latitude) },
    });
    fireEvent.change(screen.getByLabelText("Longitude"), {
      target: { value: String(ACCEPTANCE_SCENARIO.unsupportedPoint.longitude) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Analyse coordinates" }));
    expect(screen.getByRole("alert").textContent).toMatch(
      /Terrain data is not available/i,
    );
  });

  it("treats blank coordinates as invalid input rather than zero degrees", () => {
    renderLab();
    fireEvent.click(screen.getByRole("button", { name: "Analyse coordinates" }));
    expect(screen.getByRole("alert").textContent).toMatch(
      /valid decimal latitude and longitude/i,
    );
  });
});
