import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { calculateEclipseCircumstances } from "../../domain/eclipse";
import { PLANNING_VIEWPOINT_HEIGHT_METRES } from "../../domain/observer";
import { I18nProvider } from "../../i18n/I18nProvider";
import { LiveEclipseMode, LiveEvidencePanel } from "./LiveEclipseMode";

const clockHolder = vi.hoisted(() => ({
  nowUtcMs: 0,
  sampleCount: 4,
  suspect: false,
}));

vi.mock("./useLiveClock", () => ({
  useLiveClock: () => ({
    nowUtcMs: clockHolder.nowUtcMs,
    status: {
      source: "calibrated",
      divergent: false,
      suspect: clockHolder.suspect,
      calibration: {
        offsetMs: 80,
        dispersionMs: 10,
        uncertaintyMs: 25,
        sampleCount: clockHolder.sampleCount,
        calibratedAtDeviceMs: clockHolder.nowUtcMs - 120_000 - 80,
      },
    },
    calibrating: false,
    calibrationUnavailable: false,
    offline: false,
    recalibrate: () => {},
  }),
}));

vi.mock("./useWakeLock", () => ({
  useWakeLock: () => ({ state: "idle", enable: () => {} }),
}));

afterEach(() => {
  cleanup();
  clockHolder.sampleCount = 4;
  clockHolder.suspect = false;
});

function burgosEclipse() {
  const eclipse = calculateEclipseCircumstances(42.3439, -3.6969, {
    groundElevationMetres: 858.1,
    viewpointHeightAboveGroundMetres: PLANNING_VIEWPOINT_HEIGHT_METRES,
  });
  if (!eclipse) throw new Error("Expected an eclipse at the Burgos sample.");
  return eclipse;
}

describe("LiveEclipseMode", () => {
  it("counts down to C3 during totality with the calibrated chip visible", () => {
    window.history.replaceState(null, "", "/?lang=en");
    const eclipse = burgosEclipse();
    if (!eclipse.contacts.c2 || !eclipse.contacts.c3) {
      throw new Error("Expected a total eclipse at the Burgos sample.");
    }
    clockHolder.nowUtcMs = eclipse.contacts.maximum.time.getTime() + 1_000;

    render(
      <I18nProvider>
        <LiveEclipseMode
          point={{
            name: "Burgos",
            eclipse,
            displayTimeZone: "Europe/Madrid",
            elevationStatus: "ready",
          }}
          eventId="2026"
          onClose={() => {}}
          onChoosePlace={() => {}}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("Totality")).toBeTruthy();
    expect(screen.getByText("C3 in")).toBeTruthy();
    expect(screen.getByText("Synchronized · ±25 ms")).toBeTruthy();
    expect(screen.getByText("C1 · partial begins")).toBeTruthy();
    expect(screen.getByText(/Applied offset \+0\.08 s/)).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
    const progress = screen.getByRole("progressbar");
    const value = Number(progress.getAttribute("aria-valuenow"));
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(100);
  });

  it("downgrades a thin calibration to an explicit partial state", () => {
    window.history.replaceState(null, "", "/?lang=en");
    clockHolder.sampleCount = 1;
    const eclipse = burgosEclipse();
    clockHolder.nowUtcMs = eclipse.contacts.c1.time.getTime() - 3_600_000;

    render(
      <I18nProvider>
        <LiveEclipseMode
          point={{
            name: "Burgos",
            eclipse,
            displayTimeZone: "Europe/Madrid",
            elevationStatus: "ready",
          }}
          eventId="2026"
          onClose={() => {}}
          onChoosePlace={() => {}}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("Partial calibration · ±25 ms")).toBeTruthy();
    expect(screen.queryByText(/^Synchronized/)).toBeNull();
  });

  it("flags a resumed clock instead of keeping the synchronized state", () => {
    window.history.replaceState(null, "", "/?lang=en");
    clockHolder.suspect = true;
    const eclipse = burgosEclipse();
    clockHolder.nowUtcMs = eclipse.contacts.c1.time.getTime() - 3_600_000;

    render(
      <I18nProvider>
        <LiveEclipseMode
          point={{
            name: "Burgos",
            eclipse,
            displayTimeZone: "Europe/Madrid",
            elevationStatus: "ready",
          }}
          eventId="2026"
          onClose={() => {}}
          onChoosePlace={() => {}}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("Resumed · re-checking the clock")).toBeTruthy();
    expect(screen.queryByText(/^Synchronized/)).toBeNull();
    expect(screen.getByRole("button", { name: "Recalibrate" })).toBeTruthy();
  });

  it("targets C1 before the eclipse starts", () => {
    window.history.replaceState(null, "", "/?lang=en");
    const eclipse = burgosEclipse();
    clockHolder.nowUtcMs = eclipse.contacts.c1.time.getTime() - 2 * 3_600_000;

    render(
      <I18nProvider>
        <LiveEclipseMode
          point={{
            name: "Burgos",
            eclipse,
            displayTimeZone: "Europe/Madrid",
            elevationStatus: "ready",
          }}
          eventId="2026"
          onClose={() => {}}
          onChoosePlace={() => {}}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("Before first contact")).toBeTruthy();
    expect(screen.getByText("C1 in")).toBeTruthy();
  });

  it("shows an explicit empty state without a selection", () => {
    window.history.replaceState(null, "", "/?lang=en");
    const onChoosePlace = vi.fn();

    render(
      <I18nProvider>
        <LiveEclipseMode
          point={null}
          eventId="2026"
          onClose={() => {}}
          onChoosePlace={onChoosePlace}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("No place selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Choose a place" }));
    expect(onChoosePlace).toHaveBeenCalledTimes(1);
  });

  it("renders the evidence-tab variant with a full-screen action", () => {
    window.history.replaceState(null, "", "/?lang=en");
    const eclipse = burgosEclipse();
    clockHolder.nowUtcMs = eclipse.contacts.c1.time.getTime() - 3_600_000;
    const onOpenFullscreen = vi.fn();

    render(
      <I18nProvider>
        <LiveEvidencePanel
          point={{
            name: "Burgos",
            eclipse,
            displayTimeZone: "Europe/Madrid",
            elevationStatus: "ready",
          }}
          active
          onOpenFullscreen={onOpenFullscreen}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("C1 in")).toBeTruthy();
    expect(screen.getByText("C2 · totality begins")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
    expect(onOpenFullscreen).toHaveBeenCalledTimes(1);
  });

  it("closes with the Escape key", () => {
    window.history.replaceState(null, "", "/?lang=en");
    const onClose = vi.fn();

    render(
      <I18nProvider>
        <LiveEclipseMode
          point={null}
          eventId="2026"
          onClose={onClose}
          onChoosePlace={() => {}}
        />
      </I18nProvider>,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
