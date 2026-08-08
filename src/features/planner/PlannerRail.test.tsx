import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { translate, type MessageKey, type MessageValues } from "../../i18n/messages";
import { LocationExplorer } from "./PlannerRail";

const t = (key: MessageKey, values?: MessageValues) =>
  translate("en", key, values);

function renderExplorer(overrides: Partial<Parameters<typeof LocationExplorer>[0]> = {}) {
  const onCoordinates = vi.fn();
  render(
    <LocationExplorer
      hidden={false}
      searchActive={false}
      selectedId={null}
      focusSelectedRequestKey={0}
      points={[]}
      onSelect={vi.fn()}
      onCoordinates={onCoordinates}
      onSearchActiveChange={vi.fn()}
      eventId="2026"
      t={t}
      formatNumber={(value) => String(value)}
      {...overrides}
    />,
  );
  const search = screen.getByRole("searchbox", {
    name: "Search the map places",
  });
  return { onCoordinates, search };
}

afterEach(() => {
  cleanup();
});

describe("LocationExplorer coordinate search", () => {
  it("offers a coordinate result and commits the parsed pair on click", async () => {
    const user = userEvent.setup();
    const { onCoordinates, search } = renderExplorer();

    await user.type(search, "41.7636, -2.4649");
    await user.click(
      screen.getByRole("button", { name: /Go to these coordinates/i }),
    );

    expect(onCoordinates).toHaveBeenCalledWith(41.7636, -2.4649);
  });

  it("commits the coordinate when Enter is pressed in the search box", async () => {
    const user = userEvent.setup();
    const { onCoordinates, search } = renderExplorer();

    await user.type(search, "40, -3{Enter}");

    expect(onCoordinates).toHaveBeenCalledWith(40, -3);
  });

  it("does not treat a place-name query as a coordinate", async () => {
    const user = userEvent.setup();
    const { onCoordinates, search } = renderExplorer();

    await user.type(search, "Medina de Pomar{Enter}");

    expect(
      screen.queryByRole("button", { name: /Go to these coordinates/i }),
    ).toBeNull();
    expect(onCoordinates).not.toHaveBeenCalled();
  });
});
