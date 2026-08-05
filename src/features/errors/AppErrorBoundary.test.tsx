import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { AppErrorBoundary } from "./AppErrorBoundary";

function BrokenPlanner(): ReactNode {
  throw new Error("Test planner failure");
}

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("AppErrorBoundary", () => {
  it("shows a concise Spanish recovery action when rendering fails", () => {
    window.history.replaceState(null, "", "/?lang=es");
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <I18nProvider>
        <AppErrorBoundary>
          <BrokenPlanner />
        </AppErrorBoundary>
      </I18nProvider>,
    );

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(
      screen.getByRole("heading", {
        name: "El planificador no puede continuar.",
      }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Recargar" })).toBeTruthy();
  });
});
