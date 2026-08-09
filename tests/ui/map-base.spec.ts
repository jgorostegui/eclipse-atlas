import { expect, test } from "@playwright/test";
import {
  collectBrowserErrors,
  installDeterministicNetwork,
} from "./support/network-fixtures";

test("switches the base map between OSM and the IGN services", async ({
  page,
}) => {
  await installDeterministicNetwork(page);
  const browserErrors = collectBrowserErrors(page);
  await page.goto("/?state=1&lang=es&layer=none");

  const picker = page.getByRole("region", { name: "Vista del mapa" });
  const osm = picker.getByRole("button", {
    name: "Callejero (OpenStreetMap)",
  });
  const mtn = picker.getByRole("button", {
    name: "Mapa topográfico (IGN MTN)",
  });
  const pnoa = picker.getByRole("button", {
    name: "Foto aérea (IGN PNOA)",
  });
  await expect(picker).toContainText("Fondo");
  await expect(osm).toHaveAttribute("aria-pressed", "true");
  await expect(mtn).toHaveAttribute("aria-pressed", "false");
  const attribution = page.locator(".leaflet-control-attribution");
  await expect(attribution).toContainText("OpenStreetMap");
  await expect(attribution).not.toContainText("Instituto Geográfico Nacional");

  const pnoaRequest = page.waitForRequest(/tms-pnoa-ma\.idee\.es/);
  await pnoa.click();
  await pnoaRequest;
  await expect(pnoa).toHaveAttribute("aria-pressed", "true");
  await expect(osm).toHaveAttribute("aria-pressed", "false");
  await expect(attribution).toContainText("Instituto Geográfico Nacional");
  // The OSM underlay stays beneath the national imagery.
  await expect(attribution).toContainText("OpenStreetMap");

  const mtnRequest = page.waitForRequest(/www\.ign\.es\/wmts\/mapa-raster/);
  await mtn.click();
  await mtnRequest;
  await expect(mtn).toHaveAttribute("aria-pressed", "true");
  await expect(attribution).toContainText("Instituto Geográfico Nacional");

  await osm.click();
  await expect(osm).toHaveAttribute("aria-pressed", "true");
  await expect(attribution).not.toContainText("Instituto Geográfico Nacional");
  expect(browserErrors).toEqual([]);
});

test("keeps the base choice available in the mobile layers sheet", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installDeterministicNetwork(page);
  const browserErrors = collectBrowserErrors(page);
  await page.goto("/?state=1&lang=es&layer=none");

  await page
    .locator(".mobile-map-view-picker summary", { hasText: "Capas" })
    .click();
  const pnoa = page.getByRole("button", {
    name: "Foto aérea (IGN PNOA)",
  });
  const pnoaRequest = page.waitForRequest(/tms-pnoa-ma\.idee\.es/);
  await pnoa.click();
  await pnoaRequest;
  await expect(pnoa).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".leaflet-control-attribution")).toContainText(
    "Instituto Geográfico Nacional",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(browserErrors).toEqual([]);
});
