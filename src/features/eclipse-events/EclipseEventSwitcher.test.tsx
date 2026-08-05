import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { EclipseEventSwitcher } from "./EclipseEventSwitcher";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  window.localStorage.clear();
});

function renderSwitcher(locale: "en" | "es" = "en") {
  const onSelect = vi.fn();
  window.history.replaceState(null, "", `/?lang=${locale}`);
  const result = render(
    <I18nProvider>
      <EclipseEventSwitcher selectedEventId="2026" onSelect={onSelect} />
    </I18nProvider>,
  );
  return { ...result, onSelect };
}

describe("EclipseEventSwitcher", () => {
  it("selects 2027 inside the lab instead of navigating away", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderSwitcher("en");

    const trigger = screen.getByRole("button", {
      name: "Choose eclipse",
    });
    expect(trigger.hasAttribute("aria-controls")).toBe(false);
    await user.click(trigger);
    expect(trigger.getAttribute("aria-controls")).toBe("eclipse-event-panel");

    expect(
      screen.getByRole("region", { name: "Spanish eclipse events" }),
    ).toBeTruthy();
    expect(screen.getByText("Selected")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /2027/ }));
    expect(onSelect).toHaveBeenCalledWith("2027");
    expect(screen.queryByRole("region", { name: "Spanish eclipse events" })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(trigger.hasAttribute("aria-controls")).toBe(false);
  });

  it("uses Spanish labels and closes with Escape", async () => {
    const user = userEvent.setup();
    renderSwitcher("es");

    const trigger = screen.getByRole("button", {
      name: "Elegir eclipse",
    });
    await user.click(trigger);

    expect(screen.getByRole("button", { name: /2028/ })).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByRole("region", { name: "Eclipses en España" }),
    ).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
