import { expect, test } from "@playwright/test";
import {
  collectBrowserErrors,
  deterministicForecastCloudCover,
  installDeterministicNetwork,
} from "./support/network-fixtures";

test("shows national ERA5 climate and deterministic ECMWF forecast views", async ({
  page,
}) => {
  await installDeterministicNetwork(page);
  const browserErrors = collectBrowserErrors(page);
  await page.goto("/?state=1&lang=es&layer=august-cloud-climate");
  await expect(page).toHaveTitle("12 AGO 2026 · Eclipse Atlas");

  const map = page.getByRole("region", {
    name: "Mapa para planificar el eclipse",
  });
  await expect(
    page.getByRole("region", {
      name: "Datos de nubosidad en los puntos nacionales de referencia",
    }),
  ).toContainText("ERA5 1991–2020");
  await expect(map.locator(".eclipse-atmosphere-pin")).toHaveCount(41);
  expect(
    (await map.locator(".eclipse-atmosphere-pin strong").allTextContents()).every(
      (value) => /^\d+%$/.test(value),
    ),
  ).toBe(true);
  const markerColors = await map.locator(".eclipse-atmosphere-pin").evaluateAll(
    (markers) => markers.map((marker) => getComputedStyle(marker).backgroundColor),
  );
  expect(new Set(markerColors).size).toBeGreaterThan(8);
  expect(markerColors).not.toContain("rgb(231, 191, 78)");
  expect(
    (
      await map.locator(".eclipse-atmosphere-pin-shell .sr-only").allTextContents()
    ).every((title) => /\d+%.*18:00 UTC/.test(title ?? "")),
  ).toBe(true);
  await expect(
    map.getByRole("button", {
      name: /A Coruña: \d+% de nubosidad media en agosto a las 18:00 UTC/,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Datos meteorológicos: Open-Meteo" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/layer=august-cloud-climate/);

  const soriaMarker = map.getByRole("button", {
    name: /Soria: \d+% de nubosidad media en agosto a las 18:00 UTC/,
  });
  const markerAnchor = await soriaMarker.evaluate((element) => {
    const shell = element.getBoundingClientRect();
    const pin = element.querySelector(".eclipse-atmosphere-pin")?.getBoundingClientRect();
    if (!pin) return null;
    return {
      shellWidth: shell.width,
      shellHeight: shell.height,
      pinCenterX: pin.left + pin.width / 2 - shell.left,
      pinCenterY: pin.top + pin.height / 2 - shell.top,
    };
  });
  expect(markerAnchor).toEqual({
    shellWidth: 44,
    shellHeight: 44,
    pinCenterX: 22,
    pinCenterY: 22,
  });
  await soriaMarker.click();
  await expect(page.locator(".map-canvas")).toHaveAttribute("data-map-zoom", "9");

  await page
    .locator(".mobile-map-view-picker.is-desktop-visible > summary")
    .click();
  await page.getByRole("button", { name: "Previsión 12 ago", exact: true }).click();
  await expect(page).toHaveURL(/layer=eclipse-day-cloud-forecast/);
  await expect(
    page.getByRole("region", {
      name: "Datos de nubosidad en los puntos nacionales de referencia",
    }),
  ).toContainText("ECMWF IFS HRES 9 km");
  await expect(
    page.getByRole("region", {
      name: "Datos de nubosidad en los puntos nacionales de referencia",
    }),
  ).toContainText("consultada");
  await expect(map.locator(".eclipse-atmosphere-pin")).toHaveCount(41);
  expect(
    (await map.locator(".eclipse-atmosphere-pin strong").allTextContents()).every(
      (value) => /^\d+%$/.test(value),
    ),
  ).toBe(true);
  expect(browserErrors).toEqual([]);
});

test("keeps climate and live forecast separate in selected-place details", async ({
  page,
}) => {
  await installDeterministicNetwork(page);
  const browserErrors = collectBrowserErrors(page);
  await page.goto(
    "/?state=1&lang=es&selected=place%3Asoria&layer=august-cloud-climate#map",
  );
  await page.getByRole("tab", { name: "Nubes", exact: true }).click();

  const sky = page.getByRole("region", {
    name: "Nubosidad y previsión",
    exact: true,
  });
  const [cloudAt17, cloudAt18, cloudAt19, cloudAt20] =
    deterministicForecastCloudCover(
      41.76401,
      -2.46883,
    );
  await expect(sky).toContainText("Nubosidad y previsión");
  await expect(sky).toContainText("3 de 4 modelos disponibles");
  await expect(sky).toContainText("ERA5 1991–2020");
  const modelTable = sky.getByRole("table", {
    name: "Nubosidad total por modelo y hora local",
  });
  await expect(sky.locator("details")).toHaveCount(0);
  await expect(modelTable.getByRole("columnheader")).toHaveText([
    "Modelo",
    "19:00",
    /20:00/,
    "21:00",
    "22:00",
  ]);
  await expect(
    modelTable.getByRole("columnheader", {
      name: /20:00.*Hora del modelo más cercana al máximo del eclipse/,
    }),
  ).toBeVisible();
  await expect(modelTable.getByRole("row", { name: /ECMWF IFS HRES/ })).toContainText(
    new RegExp(
      `${cloudAt17}\\s*%${cloudAt18}\\s*%${cloudAt19}\\s*%${cloudAt20}\\s*%`,
    ),
  );
  await expect(modelTable.getByRole("row", { name: /NOAA GFS/ })).toContainText(
    /12\s*%18\s*%26\s*%33\s*%/,
  );
  await expect(modelTable.getByRole("row", { name: /DWD ICON/ })).toContainText(
    "Fuera del alcance de la previsión",
  );
  await expect(modelTable.getByRole("row", { name: /ECCC GEM/ })).toContainText(
    /28\s*%21\s*%14\s*%9\s*%/,
  );
  await expect(sky).toContainText("Capas (baja / media / alta)");
  await expect(sky).toContainText("Precipitación (hora anterior)");
  await expect(sky).toContainText("Viento / racha (racha máx. de las 3 h anteriores)");
  await expect(sky).toContainText("pasada 03 ago, 00:00 UTC");
  const aemet = sky.getByRole("link", {
    name: "Previsión de AEMET para Soria",
  });
  await expect(aemet).toBeVisible();
  expect(new URL(await aemet.getAttribute("href") ?? "").searchParams.get("str"))
    .toBe("Soria");
  await page
    .getByRole("button", { name: "+ Añadir a comparación", exact: true })
    .click();
  await page.getByRole("button", { name: "Comparar 1", exact: true }).click();
  await expect(
    page.getByRole("article", { name: "Datos de comparación de Soria" }),
  ).toContainText(/ECMWF IFS HRES 9 km.*consultada/);
  expect(browserErrors).toEqual([]);
});

test("keeps the sky evidence usable at 390 by 844", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installDeterministicNetwork(page);
  const browserErrors = collectBrowserErrors(page);
  await page.goto(
    "/?state=1&lang=es&selected=place%3Asoria&layer=eclipse-day-cloud-forecast#map",
  );
  await page
    .getByRole("button", { name: "Abrir los detalles de Soria" })
    .click();
  await page.getByRole("tab", { name: "Nubes", exact: true }).click();

  const sky = page.getByRole("region", {
    name: "Nubosidad y previsión",
    exact: true,
  });
  await expect(sky).toContainText("3 de 4 modelos disponibles");
  await sky.scrollIntoViewIfNeeded();
  const modelTable = sky.getByRole("table", {
    name: "Nubosidad total por modelo y hora local",
  });
  await expect(modelTable.getByRole("row")).toHaveCount(5);
  await expect(modelTable.getByRole("columnheader")).toHaveText([
    "Modelo",
    "19:00",
    /20:00/,
    "21:00",
    "22:00",
  ]);
  const tableSize = await modelTable.evaluate(
    (element) => ({
      width: element.getBoundingClientRect().width,
      scrollWidth: element.scrollWidth,
    }),
  );
  expect(tableSize.scrollWidth).toBeLessThanOrEqual(
    Math.ceil(tableSize.width),
  );
  await expect(page.getByRole("tabpanel", { name: "Nubes" })).toBeVisible();
  await expect(page.getByRole("tabpanel", { name: "Horizonte" })).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(browserErrors).toEqual([]);
});

test("falls back to rolling delivery after an exact-run service failure", async ({
  page,
}) => {
  await installDeterministicNetwork(page, "structured", "fail-once");
  await page.goto(
    "/?state=1&lang=es&selected=place%3Asoria&layer=august-cloud-climate#map",
  );
  await page.getByRole("tab", { name: "Nubes", exact: true }).click();

  const sky = page.getByRole("region", {
    name: "Nubosidad y previsión",
    exact: true,
  });
  await expect(sky).toContainText("Capas (baja / media / alta)");
  await expect(sky).toContainText("entrega continua del modelo");
  await expect(sky.getByRole("button", { name: "Reintentar" })).toHaveCount(0);
});

test("keeps a valid response with missing event-hour data unknown", async ({
  page,
}) => {
  await installDeterministicNetwork(page, "structured", "null-event-hour");
  await page.goto(
    "/?state=1&lang=es&selected=place%3Asoria&layer=august-cloud-climate#map",
  );
  await page.getByRole("tab", { name: "Nubes", exact: true }).click();

  await expect(
    page.getByRole("region", {
      name: "Nubosidad y previsión",
      exact: true,
    }),
  ).toContainText("Fuera del alcance de la previsión");
});
