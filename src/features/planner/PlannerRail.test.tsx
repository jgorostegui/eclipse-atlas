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
      searchPlaces={vi.fn(async () => [])}
      resolvePlace={vi.fn(async () => null)}
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

describe("LocationExplorer place-name search", () => {
  const SAMPLE_MATCH = {
    id: "700000123",
    type: "poblacion",
    name: "Sample hamlet, Sample hamlet (Sample municipality)",
    municipality: "Sample municipality",
    province: "Burgos",
  } as const;

  it("lists geocoder matches and commits the resolved coordinate on click", async () => {
    const user = userEvent.setup();
    const searchPlaces = vi.fn(async () => [SAMPLE_MATCH]);
    const resolvePlace = vi.fn(async () => ({
      latitude: 41.7636,
      longitude: -2.4649,
    }));
    const { onCoordinates, search } = renderExplorer({
      searchPlaces,
      resolvePlace,
    });

    await user.type(search, "Sample hamlet");
    const match = await screen.findByRole("button", {
      name: /Sample hamlet/,
    });
    expect(screen.getByText("IGN place names (CartoCiudad)")).toBeTruthy();

    await user.click(match);

    expect(searchPlaces).toHaveBeenCalledWith(
      "Sample hamlet",
      expect.any(AbortSignal),
    );
    expect(resolvePlace).toHaveBeenCalledWith(SAMPLE_MATCH);
    expect(onCoordinates).toHaveBeenCalledWith(41.7636, -2.4649);
  });

  it("does not query the geocoder for a coordinate pair", async () => {
    const user = userEvent.setup();
    const searchPlaces = vi.fn(async () => []);
    const { search } = renderExplorer({ searchPlaces });

    await user.type(search, "41.7636, -2.4649");
    await screen.findByRole("button", { name: /Go to these coordinates/i });

    expect(searchPlaces).not.toHaveBeenCalled();
    expect(screen.queryByText("IGN place names (CartoCiudad)")).toBeNull();
  });

  it("shows an explicit unavailable state when the geocoder fails", async () => {
    const user = userEvent.setup();
    const searchPlaces = vi.fn(async () => {
      throw new Error("geocoder down");
    });
    const { search } = renderExplorer({ searchPlaces });

    await user.type(search, "Sample hamlet");

    expect(
      await screen.findByText("The IGN place-name service is unavailable."),
    ).toBeTruthy();
  });

  it("keeps an unresolved match as an explicit error instead of a location", async () => {
    const user = userEvent.setup();
    const searchPlaces = vi.fn(async () => [SAMPLE_MATCH]);
    const resolvePlace = vi.fn(async () => null);
    const { onCoordinates, search } = renderExplorer({
      searchPlaces,
      resolvePlace,
    });

    await user.type(search, "Sample hamlet");
    await user.click(
      await screen.findByRole("button", { name: /Sample hamlet/ }),
    );

    expect(onCoordinates).not.toHaveBeenCalled();
    expect(
      await screen.findByText(
        "This place could not be resolved to a coordinate.",
      ),
    ).toBeTruthy();
  });
});
