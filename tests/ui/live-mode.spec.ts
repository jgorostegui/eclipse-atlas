import { expect, test, type Page } from "@playwright/test";
import {
  collectBrowserErrors,
  installDeterministicNetwork,
} from "./support/network-fixtures";

const SORIA_MAP_URL =
  "/?state=1&lang=es&event=2026&selected=place%3Asoria&layer=none#map";
const SORIA_LIVE_URL =
  "/?state=1&lang=es&event=2026&selected=place%3Asoria&layer=none#live";
const NO_SELECTION_LIVE_URL = "/?state=1&lang=es&event=2026&layer=none#live";

// A fixed afternoon before first contact on eclipse day; the page clock is
// installed here so the countdown state is independent of the real date.
const ECLIPSE_AFTERNOON = new Date("2026-08-12T15:00:00Z");

async function installProbeFixture(page: Page) {
  // The deployment edge answers the calibration probe with an X-Timer stamp;
  // the static test server does not, so the fixture plays that part. The
  // stamp follows the page's installed clock (plus a small fixed offset), so
  // periodic recalibrations stay consistent when the test jumps the clock.
  await page.route(/favicon\.svg\?clock-probe=/, async (route) => {
    const pageNowMs = await page.evaluate(() => Date.now());
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "image/svg+xml",
        "x-timer": `S${((pageNowMs + 250) / 1000).toFixed(6)},VS0,VE1`,
      },
      body: "",
    });
  });
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installDeterministicNetwork(page);
  await page.clock.install({ time: ECLIPSE_AFTERNOON });
});

test("runs the live countdown for Soria through totality and the end", async ({
  page,
}) => {
  const browserErrors = collectBrowserErrors(page);
  await installProbeFixture(page);
  await page.goto(SORIA_LIVE_URL);

  await expect(
    page.locator(".live-mode").getByRole("heading", { name: "Soria" }),
  ).toBeVisible();
  await expect(page.locator(".live-mode .live-phase__label")).toHaveText(
    "Antes del primer contacto",
  );
  await expect(page.locator(".live-mode .live-phase__target")).toHaveText("C1 en");
  await expect(page.locator(".live-mode .live-phase__countdown")).toHaveText(
    /^\d{2}:\d{2}:\d{2}/,
  );
  await expect(page.locator(".live-mode .live-sync__chip").first()).toHaveText(
    /Sincronizado · ±\d+ ms/,
  );

  const contactRows = page.locator(".live-mode .live-contacts li");
  await expect(contactRows).toHaveCount(5);
  const isoTimes = await page
    .locator(".live-mode .live-contacts li time")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("datetime")));
  expect(isoTimes).toHaveLength(5);
  const maximumMs = Date.parse(isoTimes[2] ?? "");
  const c4Ms = Date.parse(isoTimes[4] ?? "");
  expect(Number.isFinite(maximumMs)).toBe(true);
  expect(Number.isFinite(c4Ms)).toBe(true);

  // Two seconds past maximum: inside totality, counting down to C3.
  await page.clock.pauseAt(new Date(maximumMs + 2_000));
  await page.clock.runFor(500);
  await expect(page.locator(".live-mode .live-phase__label")).toHaveText("Totalidad");
  await expect(page.locator(".live-mode .live-phase__target")).toHaveText("C3 en");
  await expect(page.locator('.live-mode .live-contacts li[data-status="past"]')).toHaveCount(
    3,
  );
  const progress = Number(
    await page.getByRole("progressbar").getAttribute("aria-valuenow"),
  );
  expect(progress).toBeGreaterThan(0);
  expect(progress).toBeLessThan(100);

  // Well past C4: the sequence is over.
  await page.clock.pauseAt(new Date(c4Ms + 60_000));
  await page.clock.runFor(500);
  await expect(page.locator(".live-mode .live-phase__label")).toHaveText(
    "El eclipse ha terminado",
  );
  await expect(
    page.locator('.live-mode .live-contacts li[data-status="past"]'),
  ).toHaveCount(5);

  expect(browserErrors).toEqual([]);
});

test("runs inside the evidence tab and expands to full screen on demand", async ({
  page,
}) => {
  const browserErrors = collectBrowserErrors(page);
  await page.goto(SORIA_MAP_URL);

  await page.getByRole("tab", { name: "Reloj · cuenta atrás" }).click();
  const embedded = page.locator(".live-evidence");
  await expect(embedded.locator(".live-phase__countdown")).toBeVisible();
  // The application frame stays: the map remains on screen next to the tab.
  await expect(
    page.getByRole("region", { name: "Mapa para planificar el eclipse" }),
  ).toBeVisible();

  await embedded.getByRole("button", { name: "Pantalla completa" }).click();
  await expect(page.locator(".live-mode")).toBeVisible();
  expect(page.url()).toContain("#live");

  // Modal isolation: the covered application leaves the focus order and the
  // accessibility tree while the layer is open.
  await expect(page.locator(".live-mode")).toHaveAttribute("aria-modal", "true");
  await expect(page.locator(".planner-workspace")).toHaveAttribute("inert", "");
  await expect(page.locator(".masthead")).toHaveAttribute("inert", "");
  for (let press = 0; press < 8; press += 1) {
    await page.keyboard.press("Tab");
    const escaped = await page.evaluate(() => {
      const active = document.activeElement;
      return (
        active instanceof HTMLElement &&
        active.tagName !== "BODY" &&
        active.closest(".live-mode") === null
      );
    });
    expect(escaped).toBe(false);
  }

  await page.keyboard.press("Escape");
  await expect(page.locator(".live-mode")).toHaveCount(0);
  expect(page.url()).toContain("#map");
  await expect(embedded.locator(".live-phase__countdown")).toBeVisible();

  expect(browserErrors).toEqual([]);
});

test("states the empty case and hands over to the explorer", async ({
  page,
}) => {
  const browserErrors = collectBrowserErrors(page);
  await page.goto(NO_SELECTION_LIVE_URL);

  await expect(
    page.getByRole("heading", { name: "Ningún lugar seleccionado" }),
  ).toBeVisible();
  // Without a network time source the state says so instead of pretending.
  await expect(page.locator(".live-mode .live-sync__chip").first()).toHaveText(
    "Sin fuente horaria · reloj del dispositivo",
  );

  await page.getByRole("button", { name: "Elegir un lugar" }).click();
  await expect(
    page.getByRole("heading", { name: "Explora España", exact: true }),
  ).toBeVisible();

  expect(browserErrors).toEqual([]);
});

test("serves the mobile journey from the bottom navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const browserErrors = collectBrowserErrors(page);
  await page.goto(SORIA_MAP_URL);

  const liveNavButton = page
    .locator(".mobile-navigation")
    .getByRole("button", { name: "Reloj", exact: true });
  await expect(liveNavButton).toBeVisible();
  const navBox = await liveNavButton.boundingBox();
  expect(navBox && navBox.height >= 44).toBe(true);
  await liveNavButton.click();

  await expect(
    page.locator(".live-mode").getByRole("heading", { name: "Soria" }),
  ).toBeVisible();
  await expect(page.locator(".live-mode .live-phase__countdown")).toBeVisible();
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await page.getByRole("button", { name: "Volver", exact: true }).click();
  await expect(page.locator(".live-mode")).toHaveCount(0);
  await expect(page.locator(".mobile-selected-summary")).toBeVisible();

  expect(browserErrors).toEqual([]);
});
