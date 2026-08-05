import { expect, test } from "@playwright/test";
import {
  collectBrowserErrors,
  installDeterministicNetwork,
} from "./support/network-fixtures";

test("discovers, opens and restores official observation points", async ({
  page,
}) => {
  await installDeterministicNetwork(page);
  const browserErrors = collectBrowserErrors(page);
  await page.goto("/?state=1&lang=es&layer=totality-duration");

  const planner = page.getByRole("complementary", {
    name: "Herramientas del mapa del eclipse",
  });
  const search = planner.getByRole("searchbox", {
    name: "Buscar lugares del mapa",
  });
  await search.fill("Bardenas Reales · Aguilares");
  await expect(planner.locator(".place-list > button")).toHaveCount(1);
  await planner
    .getByRole("button", {
      name: "Bardenas Reales · Aguilares Navarra punto oficial de observación",
      exact: true,
    })
    .click();

  await expect(
    page.getByRole("heading", {
      name: "Bardenas Reales · Aguilares",
      exact: true,
    }),
  ).toBeVisible();
  await page.locator(".technical-facts").scrollIntoViewIfNeeded();
  await expect(page.getByText("Red oficial de observación", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Referencia cartográfica del lugar", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Información oficial", exact: true }),
  ).toHaveAttribute(
    "href",
    "https://eklipsenavarra.com/es/puntos-de-observaci%C3%B3n/bardenas-reales-aguilares",
  );
  await expect(
    page.getByRole("link", { name: "Abrir fuente de coordenadas" }),
  ).toHaveAttribute(
    "href",
    "https://www.openstreetmap.org/node/4772327122",
  );
  await expect(page).toHaveURL(/selected=place%3Anavarra-bardenas-aguilares/);

  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Bardenas Reales · Aguilares",
      exact: true,
    }),
  ).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test("keeps official discovery and source links usable at 390 by 844", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installDeterministicNetwork(page);
  const browserErrors = collectBrowserErrors(page);
  await page.goto(
    "/?state=1&lang=es&selected=place%3Ajcyl-42173-soria&layer=none#map",
  );
  await page
    .getByRole("button", { name: "Abrir los detalles de Soria" })
    .click();

  await expect(
    page.getByRole("heading", { name: "Soria", exact: true }),
  ).toBeVisible();
  await page.locator(".technical-facts").scrollIntoViewIfNeeded();
  const officialLink = page.getByRole("link", {
    name: "Información oficial",
    exact: true,
  });
  await expect(officialLink).toBeVisible();
  expect((await officialLink.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(browserErrors).toEqual([]);
});

test("keeps the selected point and map view when the language changes", async ({
  page,
}) => {
  await installDeterministicNetwork(page);
  const browserErrors = collectBrowserErrors(page);
  await page.goto(
    "/?state=1&lang=es&selected=place%3Ajcyl-42173-soria&layer=none#map",
  );

  const map = page.locator(".map-stage");
  await expect(map.locator(".eclipse-place-pin.is-selected")).toHaveCount(1);
  await expect(map.locator('.leaflet-tile[src*="/9/"]')).not.toHaveCount(0);

  await page.getByRole("button", { name: "EN", exact: true }).click();

  await expect(page).toHaveURL(/lang=en/);
  await expect(map.locator(".eclipse-place-pin.is-selected")).toHaveCount(1);
  await expect(map.locator('.leaflet-tile[src*="/9/"]')).not.toHaveCount(0);
  await expect(map.getByRole("button", { name: "Zoom in" })).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test("keeps an explicit 2026 official point when another eclipse is selected", async ({
  page,
}) => {
  await installDeterministicNetwork(page);
  const browserErrors = collectBrowserErrors(page);
  await page.goto(
    "/?state=1&lang=es&event=2026&selected=place%3Ajcyl-05001-adanero&compare=place%3Ajcyl-05001-adanero&layer=none#map",
  );

  const trigger = page.getByRole("button", { name: "Elegir eclipse" });
  await trigger.click();
  await page
    .getByRole("region", { name: "Eclipses en España" })
    .getByRole("button", { name: /2027/ })
    .click();

  await expect(page.getByRole("heading", { name: "Adanero" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Comparar 1" })).toBeVisible();
  await expect(page).toHaveURL(/event=2027/);
  await expect(page).toHaveURL(/selected=place%3Ajcyl-05001-adanero/);
  await expect(page).toHaveURL(/compare=place%3Ajcyl-05001-adanero/);
  await expect(trigger).toBeFocused();
  expect(browserErrors).toEqual([]);
});
