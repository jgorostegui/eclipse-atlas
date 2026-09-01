import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  calculateEclipseCircumstances,
  type EclipseCircumstances,
} from "../../domain/eclipse";
import type { TerrainHorizon } from "../../domain/terrain-horizon";
import { formatZonedTime } from "../../i18n/formatters";
import { I18nProvider } from "../../i18n/I18nProvider";
import { HorizonAnimation } from "./HorizonAnimation";

const latitude = 42.3439;
const longitude = -3.6969;
const eclipseResult = calculateEclipseCircumstances(latitude, longitude, {
  groundElevationMetres: 858.1,
  viewpointHeightAboveGroundMetres: 1.5,
});
if (!eclipseResult) throw new Error("The Burgos eclipse fixture must be visible.");
const eclipse = eclipseResult;
const partialResult = calculateEclipseCircumstances(40.4168, -3.7038, {
  groundElevationMetres: 667,
  viewpointHeightAboveGroundMetres: 1.5,
});
if (!partialResult || partialResult.kind !== "partial") {
  throw new Error("The Madrid eclipse fixture must be partial.");
}

const horizon = {
  groundElevationMetres: 858.1,
  viewpointHeightAboveGroundMetres: 1.5,
  observerElevationMetres: 859.6,
  profile: [
    { azimuthDegrees: 267.5, horizonAltitudeDegrees: 0.4, limitingDistanceKilometres: 8 },
    { azimuthDegrees: 282.5, horizonAltitudeDegrees: 1, limitingDistanceKilometres: 11 },
    { azimuthDegrees: 297.5, horizonAltitudeDegrees: 0.6, limitingDistanceKilometres: 5 },
  ],
  solarDiscProfile: [
    { azimuthDegrees: 282.25, horizonAltitudeDegrees: 1.1, limitingDistanceKilometres: 11 },
    { azimuthDegrees: 282.5, horizonAltitudeDegrees: 1, limitingDistanceKilometres: 11 },
    { azimuthDegrees: 282.75, horizonAltitudeDegrees: 0.9, limitingDistanceKilometres: 11 },
  ],
  solarDisc: {
    centreAltitudeDegrees: eclipse.sunAltitudeDegrees,
    centreAzimuthDegrees: eclipse.sunAzimuthDegrees,
    angularRadiusDegrees: eclipse.solarAngularRadiusDegrees,
  },
  solarDiscAssessment: {
    centreClearanceDegrees: 7.5,
    fullDiscClearanceDegrees: 7.2,
    anyDiscVisibilityMarginDegrees: 7.8,
    intersection: "fully-clear",
    raysEvaluated: 11,
    limitingDiscAzimuthOffsetDegrees: -0.25,
    limitingTerrainAzimuthDegrees: eclipse.sunAzimuthDegrees - 0.25,
    limitingDistanceKilometres: 11,
  },
  horizonAtSunDegrees: 1,
  source: "IGN/CNIG TerrainRGB",
  zoom: 11,
  maximumDistanceKilometres: 100,
  refractionCoefficient: 0.13,
  samplesPerRay: 360,
  profileAzimuthStepDegrees: 0.5,
  solarDiscAzimuthStepDegrees: 0.05,
} satisfies TerrainHorizon;

function renderAnimation(
  eclipseFixture: EclipseCircumstances = eclipse,
  horizonFixture: TerrainHorizon = horizon,
  fixtureLatitude = latitude,
  fixtureLongitude = longitude,
) {
  return render(
    <I18nProvider>
      <HorizonAnimation
        active
        latitude={fixtureLatitude}
        longitude={fixtureLongitude}
        eclipse={eclipseFixture}
        horizon={horizonFixture}
      />
    </I18nProvider>,
  );
}

function canvas(container: HTMLElement) {
  const element = container.querySelector<HTMLCanvasElement>(".horizon-canvas");
  if (!element) throw new Error("Expected the horizon canvas.");
  return element;
}

beforeEach(() => {
  window.history.replaceState(null, "", "/?lang=en");
  window.localStorage.clear();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("HorizonAnimation", () => {
  it("opens at maximum and moves through every exact contact without changing terrain", async () => {
    const view = renderAnimation();
    const slider = screen.getByRole("slider", {
      name: "Choose an eclipse moment",
    });
    const c1 = screen.getByRole("button", { name: /C1 · partial begins/ });
    const c2 = screen.getByRole("button", { name: /C2 · totality begins/ });
    const maximum = screen.getByRole("button", { name: /Maximum/ });
    const c3 = screen.getByRole("button", { name: /C3 · totality ends/ });
    const c4 = screen.getByRole("button", { name: /C4 · partial ends/ });
    const chart = canvas(view.container);
    const terrainSignature = chart.dataset.terrainSignature;
    const maximumSky = chart.dataset.skyUpper;

    expect(slider.getAttribute("aria-valuetext")).toBe(
      formatZonedTime("en", eclipse.peak, "Europe/Madrid"),
    );
    expect(maximum.getAttribute("aria-pressed")).toBe("true");
    expect(chart.dataset.renderer).toBe("canvas-2d");
    expect(chart.dataset.phase).toBe("total");
    expect(chart.dataset.clearanceBracket).toBe("visible");
    expect(chart.dataset.displayMagnification).toBeTruthy();
    expect(screen.getByText(/Discs ×\d+/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Replay central-phase reveal" }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Show calculated sky context" }),
    );
    expect(chart.dataset.celestialCount).toBe("13");
    expect(
      screen
        .getByText(/Their visibility is not guaranteed/)
        .classList.contains("sr-only"),
    ).toBe(true);
    expect(chart.getAttribute("aria-label")).toContain("Jupiter: altitude");
    expect(terrainSignature).toMatch(/^[0-9a-f]{8}$/);
    expect(screen.getByText("+7.2°")).toBeTruthy();
    expect(view.container.querySelectorAll(".horizon-contact-jumps button"))
      .toHaveLength(5);

    fireEvent.click(c1);
    await waitFor(() => expect(chart.dataset.phase).toBe("partial"));
    expect(slider.getAttribute("value")).toBe("0");
    expect(chart.dataset.clearanceBracket).toBe("hidden");
    expect(chart.dataset.skyUpper).not.toBe(maximumSky);
    expect(Number(chart.dataset.exposedSolarLimb)).toBeGreaterThan(0);
    expect(chart.dataset.terrainSignature).toBe(terrainSignature);

    fireEvent.click(c2);
    await waitFor(() => expect(chart.dataset.phase).toBe("total"));
    expect(chart.dataset.clearanceBracket).toBe("hidden");
    expect(Number(chart.dataset.exposedSolarLimb)).toBeLessThan(0.1);

    fireEvent.click(c3);
    await waitFor(() => expect(c3.getAttribute("aria-pressed")).toBe("true"));
    expect(chart.dataset.phase).toBe("total");

    fireEvent.click(c4);
    await waitFor(() => expect(chart.dataset.phase).toBe("partial"));
    expect(slider.getAttribute("value")).toBe("1000");
    expect(Number(chart.dataset.exposedSolarLimb)).toBeGreaterThan(0);
    expect(chart.dataset.terrainSignature).toBe(terrainSignature);

    fireEvent.click(maximum);
    await waitFor(() =>
      expect(chart.dataset.clearanceBracket).toBe("visible"),
    );
  });

  it("updates the scene directly when the scrubber moves", () => {
    const view = renderAnimation();
    const slider = screen.getByRole("slider", {
      name: "Choose an eclipse moment",
    });
    fireEvent.change(slider, { target: { value: "250" } });
    expect(slider.style.getPropertyValue("--horizon-progress")).toBe("25%");
    expect(canvas(view.container).dataset.clearanceBracket).toBe("hidden");
  });

  it("exposes the geometric blocked state without relying on rounded copy", () => {
    const blocked: TerrainHorizon = {
      ...horizon,
      solarDiscAssessment: {
        ...horizon.solarDiscAssessment!,
        fullDiscClearanceDegrees: 0,
        intersection: "partially-obscured",
      },
    };
    const view = renderAnimation(eclipse, blocked);

    expect(screen.getByText("+0.0°").classList.contains("is-blocked")).toBe(true);
    expect(canvas(view.container).dataset.clearanceState).toBe(
      "partially-obscured",
    );
  });

  it("uses only C1, maximum and C4 for a partial eclipse", () => {
    const view = renderAnimation(partialResult, horizon, 40.4168, -3.7038);

    expect(view.container.querySelectorAll(".horizon-contact-jumps button"))
      .toHaveLength(3);
    expect(canvas(view.container).dataset.phase).toBe("partial");
    expect(screen.queryByRole("button", { name: /C2/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /C3/ })).toBeNull();
  });

  it("does not restart autoplay after leaving the horizon mid-reveal", () => {
    const frames = new Map<number, FrameRequestCallback>();
    let frameId = 0;
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      frameId += 1;
      frames.set(frameId, callback);
      return frameId;
    });
    const cancelAnimationFrame = vi.fn((id: number) => frames.delete(id));
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);
    const view = render(
      <I18nProvider>
        <HorizonAnimation
          active
          latitude={latitude + 0.0001}
          longitude={longitude}
          eclipse={eclipse}
          horizon={horizon}
        />
      </I18nProvider>,
    );
    const startFrame = frames.get(1);
    if (!startFrame) throw new Error("Expected the scheduled reveal frame.");
    act(() => startFrame(performance.now()));
    const callsAfterStart = requestAnimationFrame.mock.calls.length;

    view.rerender(
      <I18nProvider>
        <HorizonAnimation
          active={false}
          latitude={latitude + 0.0001}
          longitude={longitude}
          eclipse={eclipse}
          horizon={horizon}
        />
      </I18nProvider>,
    );
    view.rerender(
      <I18nProvider>
        <HorizonAnimation
          active
          latitude={latitude + 0.0001}
          longitude={longitude}
          eclipse={eclipse}
          horizon={horizon}
        />
      </I18nProvider>,
    );

    expect(cancelAnimationFrame).toHaveBeenCalled();
    expect(requestAnimationFrame).toHaveBeenCalledTimes(callsAfterStart);
  });
});
