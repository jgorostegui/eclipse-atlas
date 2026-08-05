import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { calculateEclipseCircumstances } from "../../domain/eclipse";
import { PLANNING_VIEWPOINT_HEIGHT_METRES } from "../../domain/observer";
import { I18nProvider } from "../../i18n/I18nProvider";
import { EclipseTimeline } from "./EclipseTimeline";

afterEach(cleanup);

describe("EclipseTimeline", () => {
  it("keeps total-eclipse contacts and sunset without repeating summary metrics", () => {
    window.history.replaceState(null, "", "/?lang=en");
    const eclipse = calculateEclipseCircumstances(42.3439, -3.6969, {
      groundElevationMetres: 585,
      viewpointHeightAboveGroundMetres: PLANNING_VIEWPOINT_HEIGHT_METRES,
    });
    expect(eclipse).not.toBeNull();

    render(
      <I18nProvider>
        <EclipseTimeline
          eclipse={eclipse}
          displayTimeZone="Europe/Madrid"
        />
      </I18nProvider>,
    );

    expect(screen.getByText("C2 · totality begins")).toBeTruthy();
    expect(screen.getByText("C3 · totality ends")).toBeTruthy();
    expect(screen.queryByText("Maximum obscuration")).toBeNull();
    expect(screen.queryByText("Eclipse magnitude")).toBeNull();
    expect(screen.getByText("Sunset · ideal horizon")).toBeTruthy();
    expect(screen.getByText("C4 occurs after sunset")).toBeTruthy();
  });

  it("shows only real contacts for a partial eclipse", () => {
    window.history.replaceState(null, "", "/?lang=en");
    const eclipse = calculateEclipseCircumstances(37.38283, -5.97317, {
      groundElevationMetres: 11,
      viewpointHeightAboveGroundMetres: PLANNING_VIEWPOINT_HEIGHT_METRES,
    });
    expect(eclipse?.kind).toBe("partial");

    render(
      <I18nProvider>
        <EclipseTimeline
          eclipse={eclipse}
          displayTimeZone="Europe/Madrid"
        />
      </I18nProvider>,
    );

    expect(screen.getByText("C1 · partial begins")).toBeTruthy();
    expect(screen.getByText("Maximum")).toBeTruthy();
    expect(screen.getByText("C4 · partial ends")).toBeTruthy();
    expect(screen.queryByText("C2 · totality begins")).toBeNull();
    expect(screen.queryByText("C3 · totality ends")).toBeNull();
  });
});
