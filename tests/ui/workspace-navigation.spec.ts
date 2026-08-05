import { expect, test } from "@playwright/test";
import {
  collectBrowserErrors,
  installDeterministicNetwork,
} from "./support/network-fixtures";

const SORIA_URL =
  "/?state=1&lang=es&event=2026&selected=place%3Asoria&layer=none#map";

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installDeterministicNetwork(page);
});

test("keeps desktop selection while moving between details and places", async ({
  page,
}) => {
  const browserErrors = collectBrowserErrors(page);
  await page.goto(SORIA_URL);
  const map = page.getByRole("region", {
    name: "Mapa para planificar el eclipse",
  });

  await expect(map).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Soria", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Volver a lugares", exact: true })
    .click();

  const selectedPlace = page.locator(
    '.place-list button[data-candidate-id="soria"]',
  );
  await expect(
    page.getByRole("heading", { name: "Explora España", exact: true }),
  ).toBeVisible();
  await expect(map).toBeVisible();
  await expect(selectedPlace).toHaveAttribute("aria-current", "true");
  await expect(selectedPlace).toBeFocused();
  await expect(page).toHaveURL(/selected=place%3Asoria/);
  await expect(page).toHaveURL(/#places$/);

  await selectedPlace.click();
  await expect(page).toHaveURL(/#details$/);
  await expect(map).toBeVisible();
  await page
    .getByRole("button", { name: "Quitar selección", exact: true })
    .click();

  await expect(page).not.toHaveURL(/selected=/);
  await expect(page).toHaveURL(/#places$/);
  await expect(selectedPlace).not.toHaveAttribute("aria-current");
  await expect(
    page.getByRole("searchbox", { name: "Buscar lugares del mapa" }),
  ).toBeFocused();
  expect(browserErrors).toEqual([]);
});

test("resizes the desktop inspector with pointer-equivalent keyboard controls", async ({
  page,
}) => {
  await page.goto(SORIA_URL);
  const splitter = page.getByRole("separator", {
    name: "Cambiar el ancho del panel de detalles",
  });
  const shell = page.locator(".planner-shell");

  await expect(splitter).toBeVisible();
  const initialValue = Number(await splitter.getAttribute("aria-valuenow"));
  const initialCssWidth = await shell.evaluate((element) =>
    Number.parseFloat(
      getComputedStyle(element).getPropertyValue("--planner-rail-width"),
    ),
  );
  expect(initialValue).toBeGreaterThanOrEqual(420);
  await splitter.press("ArrowLeft");
  await expect(splitter).toHaveAttribute(
    "aria-valuenow",
    String(initialValue + 16),
  );
  expect(
    await shell.evaluate((element) =>
      Number.parseFloat(
        getComputedStyle(element).getPropertyValue("--planner-rail-width"),
      ),
    ),
  ).toBeCloseTo(initialCssWidth + 16);

  await splitter.press("Enter");
  await expect(splitter).toHaveAttribute(
    "aria-valuenow",
    String(initialValue),
  );
  expect(
    await shell.evaluate((element) =>
      Number.parseFloat(
        getComputedStyle(element).getPropertyValue("--planner-rail-width"),
      ),
    ),
  ).toBeCloseTo(initialCssWidth);
});

test("adapts the automatic inspector width to the workspace aspect ratio", async ({
  page,
}) => {
  await page.goto(SORIA_URL);
  const splitter = page.getByRole("separator", {
    name: "Cambiar el ancho del panel de detalles",
  });

  await expect(splitter).toBeVisible();
  const tallWorkspaceWidth = Number(
    await splitter.getAttribute("aria-valuenow"),
  );

  await page.setViewportSize({ width: 1440, height: 700 });
  await expect.poll(async () =>
    Number(await splitter.getAttribute("aria-valuenow")),
  ).toBeLessThan(tallWorkspaceWidth);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(splitter).toHaveAttribute(
    "aria-valuenow",
    String(tallWorkspaceWidth),
  );

  await splitter.press("ArrowLeft");
  const customizedWidth = tallWorkspaceWidth + 16;
  await expect(splitter).toHaveAttribute(
    "aria-valuenow",
    String(customizedWidth),
  );

  await page.setViewportSize({ width: 1440, height: 700 });
  await expect(splitter).toHaveAttribute(
    "aria-valuenow",
    String(customizedWidth),
  );
});

test("restores explorer focus with a fresh browser Back", async ({ page }) => {
  await page.goto("/?state=1&lang=es&event=2026&layer=none#places");
  const search = page.getByRole("searchbox", {
    name: "Buscar lugares del mapa",
  });
  await search.fill("Soria");
  const soria = page.locator(
    '.place-list button[data-candidate-id="soria"]',
  );
  await soria.click();
  await expect(page).toHaveURL(/#details$/);

  await page.goBack();

  await expect(page).toHaveURL(/#places$/);
  await expect(search).toHaveValue("Soria");
  await expect(soria).toHaveAttribute("aria-current", "true");
  await expect(soria).toBeFocused();
});

test("keeps the detail parent when the language changes", async ({ page }) => {
  await page.goto("/?state=1&lang=es&event=2026&layer=none#places");
  const search = page.getByRole("searchbox", {
    name: "Buscar lugares del mapa",
  });
  await search.fill("Soria");
  await page
    .locator('.place-list button[data-candidate-id="soria"]')
    .click();
  await page.getByRole("button", { name: "EN", exact: true }).click();

  await page
    .getByRole("button", { name: "Back to places", exact: true })
    .click();
  await expect(page).toHaveURL(/lang=en/);
  await expect(page).toHaveURL(/#places$/);
  await expect(
    page.getByRole("heading", { name: "Explore Spain", exact: true }),
  ).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(/#details$/);
  await expect(
    page.getByRole("heading", { name: "Soria", exact: true }),
  ).toBeVisible();
});

test("returns a compared point to the comparison", async ({ page }) => {
  await page.goto(
    "/?state=1&lang=es&event=2026&selected=place%3Asoria&compare=place%3Asoria&layer=none#comparison",
  );
  const comparison = page.getByRole("article", {
    name: "Datos de comparación de Soria",
  });
  await expect(comparison).toBeVisible();

  await comparison
    .getByRole("button", { name: "Abrir los detalles de Soria", exact: true })
    .click();
  await expect(page).toHaveURL(/#details$/);
  await expect(
    page.getByRole("button", { name: "Volver a la comparación", exact: true }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Volver a la comparación", exact: true })
    .click();
  await expect(page).toHaveURL(/#comparison$/);
  await expect(comparison).toBeVisible();
  await expect(page.locator(".rail-comparison")).toBeFocused();
});

test("treats Help as a reversible route and restores focus", async ({ page }) => {
  await page.goto("/?state=1&lang=es&event=2026&layer=none#map");
  const rail = page.getByRole("complementary", {
    name: "Herramientas del mapa del eclipse",
  });
  await rail.getByRole("button", { name: "Ayuda", exact: true }).click();
  await expect(page).toHaveURL(/#help$/);
  await expect(page.locator(".help-panel")).toBeFocused();

  await page.getByRole("button", { name: "Cerrar ayuda", exact: true }).click();
  await expect(page).toHaveURL(/#map$/);
  await expect(page.locator(".map-canvas")).toBeFocused();

  await page.goForward();
  await expect(page).toHaveURL(/#help$/);
  await expect(page.locator(".help-panel")).toBeFocused();
});

test("canonicalizes invalid workspace fragments", async ({ page }) => {
  await page.goto("/?state=1&lang=es&event=2026&layer=none#details");

  await expect(page).toHaveURL(/#map$/);
  await expect(
    page.getByRole("region", { name: "Mapa para planificar el eclipse" }),
  ).toBeVisible();
});

test("drops invalid nested Help ancestry instead of leaving the app", async ({
  page,
}) => {
  await page.goto(
    "/?state=1&lang=es&event=2026&layer=none&sentinel=previous#map",
  );
  await page.evaluate(() => {
    window.history.pushState(
      {
        eclipseAtlasWorkspace: {
          kind: "help",
          returnTo: { kind: "details", returnTo: "places" },
        },
        eclipseAtlasWorkspaceParentSteps: 1,
      },
      "",
      "/?state=1&lang=es&event=2026&layer=none#help",
    );
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Ayuda" })).toBeVisible();

  await page.getByRole("button", { name: "Cerrar ayuda" }).click();

  await expect(page).toHaveURL(/#map$/);
  expect(new URL(page.url()).searchParams.has("sentinel")).toBe(false);
});

test("keeps child data changes monotonic through Close and Forward", async ({
  page,
}) => {
  await page.goto("/?state=1&lang=es&event=2026&layer=none#places");
  const search = page.getByRole("searchbox", {
    name: "Buscar lugares del mapa",
  });
  await search.fill("Soria");
  await page
    .locator('.place-list button[data-candidate-id="soria"]')
    .click();
  await page
    .getByRole("button", { name: "+ Añadir a comparación", exact: true })
    .click();
  await expect(page).toHaveURL(/compare=place%3Asoria/);

  await page
    .getByRole("button", { name: "Volver a lugares", exact: true })
    .click();
  await expect(page).toHaveURL(/#places$/);
  await expect(page).toHaveURL(/compare=place%3Asoria/);

  await page.goForward();
  await expect(page).toHaveURL(/#details$/);
  await expect(page).toHaveURL(/compare=place%3Asoria/);
  await expect(
    page.getByRole("button", { name: "✓ En comparación", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("clears a desktop selection without changing the local map camera", async ({
  page,
}) => {
  await page.goto(SORIA_URL);
  const mapCanvas = page.locator(".map-canvas");
  await expect(mapCanvas).toBeVisible();
  await expect(mapCanvas).toHaveAttribute("data-map-zoom", "9");
  const centerBefore = await mapCanvas.getAttribute("data-map-center");
  const zoomBefore = await mapCanvas.getAttribute("data-map-zoom");

  await page
    .getByRole("button", { name: "Quitar selección", exact: true })
    .click();

  await expect(page).not.toHaveURL(/selected=/);
  await expect(page.locator(".planner-shell")).toHaveCSS(
    "--planner-rail-width",
    "448px",
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  const centerAfter = await mapCanvas.getAttribute("data-map-center");
  if (!centerBefore || !centerAfter) throw new Error("Expected map centre metadata.");
  const beforeCoordinate = centerBefore.split(",").map(Number);
  const afterCoordinate = centerAfter.split(",").map(Number);
  expect(Math.abs(afterCoordinate[0] - beforeCoordinate[0])).toBeLessThan(0.002);
  expect(Math.abs(afterCoordinate[1] - beforeCoordinate[1])).toBeLessThan(0.003);
  await expect(mapCanvas).toHaveAttribute("data-map-zoom", zoomBefore ?? "");
});

test("uses the brand action to clear selection and restore the national view", async ({
  page,
}) => {
  await page.goto(SORIA_URL);
  const mapCanvas = page.locator(".map-canvas");
  await expect(mapCanvas).toBeVisible();
  await expect(mapCanvas).toHaveAttribute("data-map-zoom", "9");

  await page
    .getByRole("button", { name: "Mapa de Eclipse Atlas", exact: true })
    .click();

  await expect(page).not.toHaveURL(/selected=/);
  await expect(page).toHaveURL(/#map$/);
  await expect
    .poll(async () => Number(await mapCanvas.getAttribute("data-map-zoom")))
    .toBeLessThan(9);
});
