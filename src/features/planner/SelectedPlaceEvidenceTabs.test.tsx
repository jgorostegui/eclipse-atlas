import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { SelectedPlaceEvidenceTabs } from "./SelectedPlaceEvidenceTabs";
import type { SelectedPlaceEvidenceView } from "./selected-place-evidence";

beforeEach(() => {
  window.history.replaceState(null, "", "/?lang=en");
});

afterEach(() => {
  cleanup();
});

describe("SelectedPlaceEvidenceTabs", () => {
  it("selects evidence directly and with the standard horizontal-tab keys", () => {
    const onSelect = vi.fn();
    function Harness() {
      const [selected, setSelected] = useState<SelectedPlaceEvidenceView>("horizon");
      return (
        <SelectedPlaceEvidenceTabs
          activeView={selected}
          onChange={(view) => {
            onSelect(view);
            setSelected(view);
          }}
        />
      );
    }
    render(
      <I18nProvider>
        <Harness />
      </I18nProvider>,
    );

    const horizon = screen.getByRole("tab", { name: "Horizon" });
    const clouds = screen.getByRole("tab", { name: "Clouds" });
    expect(horizon.getAttribute("aria-selected")).toBe("true");
    expect(horizon.getAttribute("aria-controls")).toBe(
      "selected-place-panel-horizon",
    );

    fireEvent.keyDown(horizon, { key: "ArrowRight" });
    expect(onSelect).toHaveBeenLastCalledWith("clouds");
    expect(document.activeElement).toBe(clouds);

    fireEvent.keyDown(clouds, { key: "Home" });
    expect(onSelect).toHaveBeenLastCalledWith("horizon");
    expect(document.activeElement).toBe(horizon);

    fireEvent.keyDown(horizon, { key: "ArrowLeft" });
    expect(onSelect).toHaveBeenLastCalledWith("clouds");
    expect(document.activeElement).toBe(clouds);

    fireEvent.keyDown(clouds, { key: "End" });
    expect(onSelect).toHaveBeenLastCalledWith("clouds");
    expect(document.activeElement).toBe(clouds);
  });
});
