import { expect, test } from "@playwright/test";
import {
  collectBrowserErrors,
  installDeterministicNetwork,
} from "./support/network-fixtures";

const PLACES_URL = "/?state=1&lang=es&event=2026&layer=none#places";

// The coordinate a user typically copies from Google Maps, and the deterministic
// custom point it resolves to (six-decimal, terrain-supported).
const PASTED = "41.7636, -2.4649";
const CUSTOM_HEADING = /Punto personalizado 41\.763600, -2\.464900/;

const viewports = [
  { name: "desktop", width: 1440, height: 1000, mobile: false },
  { name: "mobile", width: 390, height: 844, mobile: true },
] as const;

for (const viewport of viewports) {
  test(`selects a pasted coordinate from the search box on ${viewport.name}`, async ({
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
    await search.fill(PASTED);

    const coordinateResult = page.getByRole("button", {
      name: /Ir a estas coordenadas/,
    });
    await expect(coordinateResult).toBeVisible();
    await coordinateResult.click();

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
