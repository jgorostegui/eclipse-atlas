import { expect, test } from "@playwright/test";
import {
  collectBrowserErrors,
  installDeterministicNetwork,
} from "./support/network-fixtures";

const PLACES_URL = "/?state=1&lang=es&event=2026&layer=none#places";

// The deterministic geocoder fixture answers every query with one synthetic
// settlement that resolves to the same terrain-supported custom point the
// coordinate-search journey uses.
const TYPED = "Aldea Fixture";
const GEOCODER_RESULT = /Aldea Fixture, Aldea Fixture \(Municipio Fixture\)/;
const CUSTOM_HEADING = /Punto personalizado 41\.763600, -2\.464900/;

const viewports = [
  { name: "desktop", width: 1440, height: 1000, mobile: false },
  { name: "mobile", width: 390, height: 844, mobile: true },
] as const;

for (const viewport of viewports) {
  test(`selects an IGN place-name result from the search box on ${viewport.name}`, async ({
    page,
  }) => {
    await installDeterministicNetwork(page);
    const browserErrors = collectBrowserErrors(page);

    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await page.goto(PLACES_URL);

    const search = page.getByRole("searchbox", {
      name: "Buscar lugares del mapa",
    });
    await search.fill(TYPED);

    await expect(
      page.getByRole("heading", { name: "Topónimos del IGN (CartoCiudad)" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Búsqueda de topónimos © Instituto Geográfico Nacional de España",
      ),
    ).toBeVisible();

    const geocoderResult = page.getByRole("button", { name: GEOCODER_RESULT });
    await expect(geocoderResult).toBeVisible();
    await geocoderResult.click();

    await expect(
      page.getByRole("heading", { name: CUSTOM_HEADING }),
    ).toBeVisible();
    await expect(page).toHaveURL(
      /selected=geo%3A41\.763600%2C-2\.464900/,
    );

    if (viewport.mobile) {
      const overflows = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      );
      expect(overflows, "mobile layout must not overflow horizontally").toBe(
        false,
      );
    }

    expect(browserErrors).toEqual([]);
  });
}
