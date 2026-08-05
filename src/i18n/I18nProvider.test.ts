import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { formatZonedTime } from "./formatters";
import { I18nProvider } from "./I18nProvider";
import { useI18n } from "./useI18n";

function LocaleProbe() {
  const { locale, setLocale } = useI18n();
  return createElement(
    "div",
    null,
    createElement("output", null, locale),
    createElement(
      "button",
      {
        type: "button",
        onClick: () => setLocale(locale === "en" ? "es" : "en"),
      },
      "Switch locale",
    ),
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
  window.localStorage.clear();
});

describe("zoned time formatting", () => {
  it("uses the selected Spanish display zone without shifting the instant", () => {
    const instant = new Date("2026-08-12T18:28:00Z");
    expect(formatZonedTime("en", instant, "Europe/Madrid")).toContain("20:28");
    expect(formatZonedTime("en", instant, "Atlantic/Canary")).toContain(
      "19:28",
    );
  });

  it("localises presentation without changing the selected zone", () => {
    const instant = new Date("2026-08-12T18:53:31.102Z");
    expect(formatZonedTime("en", instant, "Atlantic/Canary")).toContain(
      "19:53:31",
    );
    expect(formatZonedTime("es", instant, "Atlantic/Canary")).toContain(
      "19:53:31",
    );
  });
});

describe("locale storage failure handling", () => {
  it("mounts when reading local storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });

    render(
      createElement(I18nProvider, null, createElement(LocaleProbe)),
    );

    expect(screen.getByRole("status").textContent).toMatch(/^(en|es)$/);
  });

  it("updates the locale and URL when writing local storage is blocked", async () => {
    window.history.replaceState(null, "", "/?lang=en");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    const user = userEvent.setup();

    render(
      createElement(I18nProvider, null, createElement(LocaleProbe)),
    );
    await user.click(screen.getByRole("button", { name: "Switch locale" }));

    expect(screen.getByRole("status").textContent).toBe("es");
    expect(new URL(window.location.href).searchParams.get("lang")).toBe("es");
  });

  it("preserves application-owned browser history state", async () => {
    const navigationState = {
      eclipseAtlasWorkspace: { kind: "details", returnTo: "places" },
      eclipseAtlasWorkspaceParentSteps: 1,
    };
    window.history.replaceState(navigationState, "", "/?lang=en#details");
    const user = userEvent.setup();

    render(createElement(I18nProvider, null, createElement(LocaleProbe)));
    await user.click(screen.getByRole("button", { name: "Switch locale" }));

    expect(window.history.state).toEqual(navigationState);
    expect(new URL(window.location.href).searchParams.get("lang")).toBe("es");
  });
});
