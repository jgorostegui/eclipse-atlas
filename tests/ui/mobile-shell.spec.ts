import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  collectBrowserErrors,
  installDeterministicNetwork,
} from "./support/network-fixtures";
import {
  installVisualViewport,
  setVisualViewportHeight,
} from "./support/visual-viewport";

const SORIA_URL =
  "/?state=1&lang=es&event=2026&selected=place%3Asoria&layer=none#map";

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installDeterministicNetwork(page);
});

test("keeps the map primary and opens selected-place details on demand", async ({
  page,
}) => {
  const browserErrors = collectBrowserErrors(page);
  await page.goto(SORIA_URL);

  const navigation = page.getByRole("navigation", {
    name: "Navegación móvil",
  });
  await expect(navigation.getByRole("button")).toHaveCount(4);
  await expect(
    navigation.getByRole("button", { name: "Mapa", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("region", { name: "Mapa para planificar el eclipse" }),
  ).toBeVisible();

  const selectedSummary = page.getByRole("button", {
    name: "Abrir los detalles de Soria",
  });
  await expect(selectedSummary).toContainText("total · 1 min 42 s");
  await expect(selectedSummary).toContainText("100%");
  await expect(selectedSummary).toContainText("Sol cubierto");
  await expect(selectedSummary).toContainText("Horizonte libre");
  await expect(selectedSummary).toContainText("Detalles");
  await expect(selectedSummary).not.toHaveAttribute("aria-label");
  await selectedSummary.click();

  await expect(
    navigation.getByRole("button", { name: "Explorar", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page).toHaveURL(/#details$/);
  await expect(
    page.getByRole("heading", { name: "Soria", exact: true }),
  ).toBeVisible();
  const outcome = page.getByRole("region", {
    name: "Datos del eclipse para el punto seleccionado",
  });
  await expect(outcome).toContainText("100%");
  await expect(outcome).toContainText("Eclipse total");
  await expect(
    page.getByRole("region", { name: "Horizonte oeste" }),
  ).toBeVisible();
  const detailOrder = await page.locator(".detail-panel").evaluate((panel) => {
    const children = [...panel.children];
    return {
      outcome: children.findIndex((child) =>
        child.classList.contains("eclipse-outcome"),
      ),
      tabs: children.findIndex((child) =>
        child.classList.contains("detail-evidence-tabs"),
      ),
      panels: children.findIndex((child) =>
        child.classList.contains("detail-evidence-panels"),
      ),
    };
  });
  expect(detailOrder.outcome).toBeLessThan(detailOrder.tabs);
  expect(detailOrder.tabs).toBeLessThan(detailOrder.panels);
  await expect(
    page.getByRole("region", { name: "Mapa para planificar el eclipse" }),
  ).toBeHidden();
  await expect(page.locator(".detail-panel")).toBeFocused();

  await page
    .getByRole("button", { name: "Volver a lugares", exact: true })
    .click();
  await expect(page).toHaveURL(/#places$/);
  await expect(
    page.locator('.place-list button[data-candidate-id="soria"]'),
  ).toHaveAttribute("aria-current", "true");
  await navigation
    .getByRole("button", { name: "Mapa", exact: true })
    .click();
  await expect(selectedSummary).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Mapa para planificar el eclipse" }),
  ).toBeFocused();
  await expect(page).toHaveURL(/selected=place%3Asoria/);
  await expect(page).toHaveURL(/#map$/);
  await page
    .getByRole("button", { name: "Quitar Soria", exact: true })
    .click();
  await expect(selectedSummary).toHaveCount(0);
  await expect(page).not.toHaveURL(/selected=/);
  await expect(
    page.getByRole("region", { name: "Mapa para planificar el eclipse" }),
  ).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(browserErrors).toEqual([]);
});

test("preserves the Explore stack across repeated tab switches", async ({
  page,
}) => {
  await page.goto("/?state=1&lang=es&event=2026&layer=none#map");
  const navigation = page.getByRole("navigation", {
    name: "Navegación móvil",
  });
  const mapTab = navigation.getByRole("button", {
    name: "Mapa",
    exact: true,
  });
  const exploreTab = navigation.getByRole("button", {
    name: "Explorar",
    exact: true,
  });

  await exploreTab.click();
  const search = page.getByRole("searchbox", {
    name: "Buscar lugares del mapa",
  });
  await search.fill("Soria");
  const soria = page.locator(
    '.place-list button[data-candidate-id="soria"]',
  );
  await soria.click();

  await expect(page).toHaveURL(/#details$/);
  await expect(exploreTab).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("heading", { name: "Soria", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Nubes", exact: true }).click();
  await expect(page.getByRole("region", { name: "Nubosidad y previsión" })).toBeVisible();
  await page.getByRole("tab", { name: "Horizonte", exact: true }).click();
  await expect(page.getByRole("slider", { name: "Elegir un momento del eclipse" }))
    .toBeVisible();
  await page.getByRole("tab", { name: "Nubes", exact: true }).click();

  await mapTab.click();
  await expect(page).toHaveURL(/#map$/);
  await expect(mapTab).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("button", { name: "Abrir los detalles de Soria" }),
  ).toBeVisible();

  await exploreTab.click();
  await expect(page).toHaveURL(/#details$/);
  await expect(
    page.getByRole("heading", { name: "Soria", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "Nubes", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("region", { name: "Nubosidad y previsión" })).toBeVisible();

  await page
    .getByRole("button", { name: "Volver a lugares", exact: true })
    .click();
  await expect(page).toHaveURL(/#places$/);
  await expect(soria).toHaveAttribute("aria-current", "true");
  await expect(soria).toBeFocused();

  await mapTab.click();
  await page.reload();
  await expect(mapTab).toHaveAttribute("aria-current", "page");
  await exploreTab.click();
  await expect(page).toHaveURL(/#places$/);
  await expect(soria).toHaveAttribute("aria-current", "true");

  await soria.click();
  await page
    .getByRole("button", { name: "Quitar selección", exact: true })
    .click();
  await expect(page).toHaveURL(/#places$/);
  await expect(page).not.toHaveURL(/selected=/);
  await expect(soria).not.toHaveAttribute("aria-current");

  await mapTab.click();
  await exploreTab.click();
  await expect(page).toHaveURL(/#places$/);
  await expect(search).toBeVisible();
});

test("downloads only the lightweight masthead artwork on mobile", async ({
  page,
}) => {
  const artworkRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("eclipse-atlas-header")) {
      artworkRequests.push(request.url());
    }
  });

  await page.goto(SORIA_URL);
  await expect(page.locator(".masthead-art")).toBeVisible();
  const uniqueArtworkRequests = [...new Set(artworkRequests)];
  expect(uniqueArtworkRequests).toHaveLength(1);
  expect(uniqueArtworkRequests[0]).toContain(
    "eclipse-atlas-header-mobile-960.webp",
  );
  expect(uniqueArtworkRequests[0]).not.toContain(
    "eclipse-atlas-header-1600.webp",
  );
});

test("keeps search results usable while the iPhone keyboard is open", async ({
  page,
}) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await installVisualViewport(page, 699);
  await page.goto("/?state=1&lang=es&event=2026&layer=none#places");

  const search = page.getByRole("searchbox", {
    name: "Buscar lugares del mapa",
  });
  await search.focus();
  await setVisualViewportHeight(page, 390);
  await search.fill("Burgos");

  await expect(page.locator(".planner-shell")).toHaveAttribute(
    "data-search-active",
    "true",
  );
  await expect(page.locator(".masthead")).toBeHidden();
  await expect(page.locator(".mobile-navigation")).toBeHidden();
  await expect(page.locator(".explorer-heading")).toBeHidden();
  await expect(page.locator(".place-filters")).toHaveCount(0);
  await expect(page.locator(".place-list-heading")).toBeHidden();
  const result = page.locator(
    '.place-list button[data-candidate-id="burgos"]',
  );
  await expect(result).toBeVisible();

  const shellBox = await page.locator(".planner-shell").boundingBox();
  const resultBox = await result.boundingBox();
  expect(shellBox?.height).toBe(390);
  expect(resultBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect((resultBox?.y ?? 0) + (resultBox?.height ?? 0))
    .toBeLessThanOrEqual((shellBox?.y ?? 0) + (shellBox?.height ?? 0));
  await expect(page.locator(".planner-shell")).toHaveScreenshot(
    "iphone-keyboard-search.png",
    {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.04,
    },
  );

  await result.click();
  await setVisualViewportHeight(page, 699);
  await expect(
    page.getByRole("heading", { name: "Burgos", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".masthead")).toBeVisible();
  await expect(page.locator(".mobile-navigation")).toBeVisible();
  await expect(page.locator(".planner-shell")).not.toHaveAttribute(
    "data-search-active",
    "true",
  );
});

test("opens Help from the bottom navigation and includes About", async ({
  page,
}) => {
  const browserErrors = collectBrowserErrors(page);
  await page.goto(SORIA_URL);

  await expect(
    page.getByRole("button", { name: "Compartir", exact: true }),
  ).toHaveCount(0);

  const navigation = page.getByRole("navigation", {
    name: "Navegación móvil",
  });
  await navigation
    .getByRole("button", { name: "Ayuda", exact: true })
    .click();

  await expect(
    navigation.getByRole("button", { name: "Ayuda", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("heading", { name: "Ayuda", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".help-panel")).toBeFocused();
  await expect(page.locator(".help-section")).toHaveCount(4);

  const about = page
    .locator(".help-section")
    .filter({ hasText: "Acerca de Eclipse Atlas" });
  await about.locator("summary").click();
  await expect(about).toContainText(
    "No ordena lugares ni mezcla evidencias distintas en una puntuación.",
  );
  await expect(
    about.getByRole("link", { name: "Ver código en GitHub" }),
  ).toHaveAttribute(
    "href",
    "https://github.com/jgorostegui/eclipse-atlas",
  );

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  expect(browserErrors).toEqual([]);
});

test("keeps comparison contextual instead of adding a fourth destination", async ({
  page,
}) => {
  await page.goto(SORIA_URL);
  const navigation = page.getByRole("navigation", {
    name: "Navegación móvil",
  });
  await page
    .getByRole("button", { name: "Abrir los detalles de Soria" })
    .click();

  await page
    .getByRole("button", { name: "+ Añadir a comparación", exact: true })
    .click();
  const openComparison = page.getByRole("button", {
    name: "Comparar 1",
    exact: true,
  });
  await expect(openComparison).toBeVisible();
  await openComparison.click();

  await expect(
    page.getByRole("article", { name: "Datos de comparación de Soria" }),
  ).toBeVisible();
  await expect(navigation.getByRole("button")).toHaveCount(4);
  await expect(
    navigation.getByRole("button", { name: "Comparar", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Volver a explorar", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Soria", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/#details$/);
  await expect(
    navigation.getByRole("button", { name: "Explorar", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

test("returns to the explorer origin and preserves its working state", async ({
  page,
}) => {
  await page.goto("/?state=1&lang=es&event=2026&layer=none#map");
  const navigation = page.getByRole("navigation", {
    name: "Navegación móvil",
  });
  await navigation
    .getByRole("button", { name: "Explorar", exact: true })
    .click();

  const search = page.getByRole("searchbox", {
    name: "Buscar lugares del mapa",
  });
  await search.fill("Soria");
  const soria = page.getByRole("button", {
    name: "Soria Castilla y León",
    exact: true,
  });
  await soria.click();

  await expect(page).toHaveURL(/selected=place%3Asoria/);
  await expect(page).toHaveURL(/#details$/);
  await expect(
    page.getByRole("button", { name: "Volver a lugares", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Volver a lugares", exact: true })
    .click();

  await expect(search).toHaveValue("Soria");
  await expect(soria).toHaveAttribute("aria-current", "true");
  await expect(soria).toBeFocused();
  await expect(page).toHaveURL(/selected=place%3Asoria/);
  await expect(page).toHaveURL(/#places$/);
  await expect(
    navigation.getByRole("button", { name: "Explorar", exact: true }),
  ).toHaveAttribute("aria-current", "page");

  await page.goForward();
  await expect(page).toHaveURL(/#details$/);
  await expect(
    page.getByRole("heading", { name: "Soria", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#places$/);
  await expect(soria).toBeFocused();

  await soria.click();
  await page
    .getByRole("button", { name: "Quitar selección", exact: true })
    .click();
  await expect(search).toHaveValue("Soria");
  await expect(soria).not.toHaveAttribute("aria-current");
  await expect(page).not.toHaveURL(/selected=/);
  await expect(page).toHaveURL(/#places$/);
});

test("restores the collapsed selected place with browser history", async ({
  page,
}) => {
  await page.goto(SORIA_URL);
  const selectedSummary = page.getByRole("button", {
    name: "Abrir los detalles de Soria",
  });
  await selectedSummary.click();
  await expect(page).toHaveURL(/#details$/);

  await page.goBack();

  await expect(page).toHaveURL(/selected=place%3Asoria/);
  await expect(page).toHaveURL(/#map$/);
  await expect(selectedSummary).toBeVisible();
});

test("keeps the compact header and navigation usable at 320 pixels", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(SORIA_URL);

  const geometry = await page.locator(".masthead button").evaluateAll((buttons) =>
    buttons
      .map((button) => button.getBoundingClientRect())
      .filter(({ width, height }) => width > 0 && height > 0)
      .map(({ left, right, height }) => ({ left, right, height })),
  );
  expect(geometry.every(({ left, right }) => left >= 0 && right <= 320)).toBe(true);
  expect(geometry.every(({ height }) => height >= 40)).toBe(true);
  const headerGroups = await page
    .locator(".masthead")
    .evaluate((header) => {
      const primary = header
        .querySelector<HTMLElement>(".masthead-primary")
        ?.getBoundingClientRect();
      const actions = header
        .querySelector<HTMLElement>(".masthead-actions")
        ?.getBoundingClientRect();

      return {
        primaryRight: primary?.right ?? 0,
        actionsLeft: actions?.left ?? 0,
      };
    });
  expect(headerGroups.primaryRight).toBeLessThanOrEqual(headerGroups.actionsLeft);
  await expect(
    page.getByRole("navigation", { name: "Navegación móvil" }).getByRole("button"),
  ).toHaveCount(4);

  await page.getByRole("button", { name: "Abrir los detalles de Soria" }).click();
  await page
    .getByRole("button", { name: "+ Añadir a comparación", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "✓ En comparación", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Comparar 1", exact: true }),
  ).toBeVisible();
  await expect(page.locator("canvas.horizon-canvas"))
    .toHaveAttribute("data-render-state", "ready");

  const detailGeometry = await page.evaluate(() => {
    const identity = document
      .querySelector<HTMLElement>(".detail-header__identity")!
      .getBoundingClientRect();
    const actions = document
      .querySelector<HTMLElement>(".detail-header__actions")!
      .getBoundingClientRect();
    const panel = document.querySelector<HTMLElement>(
      ".detail-evidence-panel--horizon",
    )!;
    return {
      headerHeight: document
        .querySelector<HTMLElement>(".detail-header")!
        .getBoundingClientRect().height,
      identityRight: identity.right,
      actionsLeft: actions.left,
      panelClientWidth: panel.clientWidth,
      panelScrollWidth: panel.scrollWidth,
    };
  });
  expect(detailGeometry.headerHeight).toBeLessThanOrEqual(110);
  expect(detailGeometry.identityRight).toBeLessThanOrEqual(
    detailGeometry.actionsLeft,
  );
  expect(detailGeometry.panelScrollWidth).toBeLessThanOrEqual(
    detailGeometry.panelClientWidth,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
