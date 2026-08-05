import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  collectBrowserErrors,
  installDeterministicNetwork,
} from "./support/network-fixtures";

const SELECTED_LOCATION_URL =
  "/?state=1&lang=es&event=2026&selected=place%3Asoria&layer=none#map";

const viewportMatrix = [
  { name: "wide desktop", width: 1440, height: 1000, stacked: false },
  { name: "compact desktop", width: 1024, height: 768, stacked: false },
  { name: "tablet", width: 900, height: 900, stacked: true },
  { name: "mobile", width: 390, height: 844, stacked: true },
] as const;

function axeFingerprints(
  violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"],
) {
  return violations.map((violation) => ({
    rule: violation.id,
    impact: violation.impact,
    targets: violation.nodes.map((node) => node.target),
  }));
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

test("keeps the main planner states free of automated WCAG A and AA violations", async ({
  page,
}) => {
  await installDeterministicNetwork(page);

  for (const scenario of [
    {
      url: "/?state=1&lang=en&event=2026&layer=none",
      viewport: { width: 1440, height: 1000 },
    },
    {
      url: SELECTED_LOCATION_URL,
      viewport: { width: 1440, height: 1000 },
    },
    {
      url: SELECTED_LOCATION_URL,
      viewport: { width: 390, height: 844 },
    },
  ]) {
    await page.setViewportSize(scenario.viewport);
    await page.goto(scenario.url);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(axeFingerprints(result.violations)).toEqual([]);
  }
});

test("keeps the fatal recovery screen readable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 440, height: 763 });
  await page.goto("/?state=1&lang=en&event=2026&layer=none");
  await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>("#root");
    if (!root) throw new Error("Missing application root");
    root.innerHTML = `
      <main class="fatal-error" role="alert">
        <span class="eyebrow">Eclipse Atlas</span>
        <h1>The planner could not continue.</h1>
        <p>Reload the page. If it happens again, keep the selected coordinates and report the problem.</p>
        <button type="button">Reload</button>
      </main>
    `;
  });

  const recovery = page.getByRole("alert");
  await expect(recovery).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reload" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  const result = await new AxeBuilder({ page })
    .include(".fatal-error")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(axeFingerprints(result.violations)).toEqual([]);
});

test("keeps the application frame aligned across desktop, tablet and mobile", async ({
  page,
}) => {
  await installDeterministicNetwork(page);
  const browserErrors = collectBrowserErrors(page);

  for (const viewport of viewportMatrix) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(SELECTED_LOCATION_URL);
    if (viewport.stacked) {
      await expect(
        page.getByRole("button", { name: "Abrir los detalles de Soria" }),
      ).toBeVisible();
    } else {
      await expect(
        page.getByRole("heading", { name: "Soria", exact: true }),
      ).toBeVisible();
    }

    const geometry = await page.evaluate(() => {
      const rect = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) throw new Error(`Missing ${selector}`);
        const bounds = element.getBoundingClientRect();
        return {
          top: bounds.top,
          right: bounds.right,
          bottom: bounds.bottom,
          left: bounds.left,
          width: bounds.width,
          height: bounds.height,
        };
      };
      return {
        header: rect(".masthead"),
        primary: rect(".masthead-primary"),
        actions: rect(".masthead-actions"),
        workspace: rect(".planner-workspace"),
        map: rect(".map-panel"),
        rail: rect(".planner-rail"),
        mobileNavigation: rect(".mobile-navigation"),
      };
    });

    expect(geometry.header.top, viewport.name).toBeGreaterThanOrEqual(0);
    expect(
      geometry.primary.right <= geometry.actions.left,
      `${viewport.name}: header controls overlap`,
    ).toBe(true);
    expect(
      Math.abs(geometry.workspace.top - geometry.header.bottom),
      `${viewport.name}: workspace does not follow the header`,
    ).toBeLessThanOrEqual(1);

    if (viewport.stacked) {
      expect(
        geometry.map.width === geometry.workspace.width,
        `${viewport.name}: the map does not fill the mobile workspace`,
      ).toBe(true);
      expect(geometry.rail.width, viewport.name).toBe(0);
      expect(
        Math.abs(geometry.workspace.bottom - geometry.mobileNavigation.top),
        `${viewport.name}: bottom navigation does not follow the workspace`,
      ).toBeLessThanOrEqual(1);
    } else {
      expect(
        Math.abs(geometry.map.top - geometry.rail.top),
        `${viewport.name}: map and detail panel start at different heights`,
      ).toBeLessThanOrEqual(1);
      expect(
        geometry.map.right <= geometry.rail.left + 1,
        `${viewport.name}: map and detail panel overlap`,
      ).toBe(true);
      expect(geometry.rail.width, viewport.name).toBeGreaterThanOrEqual(398);
      expect(
        geometry.map.width > geometry.rail.width,
        `${viewport.name}: the inspector is wider than the map`,
      ).toBe(true);
      expect(
        geometry.rail.width <= geometry.workspace.width * 0.48 + 1,
        `${viewport.name}: the inspector exceeds its desktop width limit`,
      ).toBe(true);
    }

    await expectNoHorizontalOverflow(page);
  }

  expect(browserErrors).toEqual([]);
});

test("supports the complete header flow from the keyboard", async ({ page }) => {
  await installDeterministicNetwork(page);
  await page.goto("/?state=1&lang=en&event=2026&layer=none");

  const controls = [
    page.getByRole("button", { name: "Eclipse Atlas map" }),
    page.getByRole("button", { name: "Choose eclipse" }),
    page.getByRole("button", { name: "EN", exact: true }),
    page.getByRole("button", { name: "ES", exact: true }),
  ];
  await expect(
    page.getByRole("button", { name: "Share", exact: true }),
  ).toHaveCount(0);

  for (const control of controls) {
    await page.keyboard.press("Tab");
    await expect(control).toBeFocused();
    expect(
      await control.evaluate((element) => getComputedStyle(element).outlineStyle),
    ).not.toBe("none");
  }

  const switcher = controls[1];
  await switcher.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("region", { name: "Spanish eclipse events" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("region", { name: "Spanish eclipse events" }),
  ).toHaveCount(0);
  await expect(switcher).toBeFocused();
});

test("keeps the header in view when a point is selected on a compact desktop", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await installDeterministicNetwork(page);
  await page.goto("/?state=1&lang=es&event=2026&layer=none");

  const planner = page.getByRole("complementary", {
    name: "Herramientas del mapa del eclipse",
  });
  const search = planner.getByRole("searchbox", {
    name: "Buscar lugares del mapa",
  });
  await search.fill("Soria");
  await planner
    .getByRole("button", {
      name: "Soria Castilla y León ciudad en totalidad",
      exact: true,
    })
    .click();

  await expect(page.getByRole("heading", { name: "Soria", exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const header = await page.locator(".masthead").boundingBox();
  expect(header?.y ?? -1).toBe(0);
});

test("makes the selected eclipse outcome dominant before local evidence", async ({
  page,
}) => {
  await installDeterministicNetwork(page);
  await page.goto(SELECTED_LOCATION_URL);

  const outcome = page.getByRole("region", {
    name: "Datos del eclipse para el punto seleccionado",
  });
  await expect(outcome).toContainText("100%");
  await expect(outcome).toContainText("Eclipse total");
  const outcomeSize = await outcome
    .locator(".eclipse-outcome__result strong")
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  const horizonSize = await page
    .locator(".horizon-primary strong")
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(outcomeSize).toBeGreaterThan(horizonSize);

  const order = await page.locator(".detail-panel").evaluate((panel) => {
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
  expect(order.outcome).toBeLessThan(order.tabs);
  expect(order.tabs).toBeLessThan(order.panels);
  await expect(page.getByRole("tab", { name: "Horizonte" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("region", { name: "Horizonte oeste" })).toBeVisible();

  await page.getByRole("tab", { name: "Nubes" }).click();
  await expect(page.getByRole("region", { name: "Nubosidad y previsión" })).toBeVisible();

  await page.getByRole("tab", { name: "Horizonte" }).click();
  await page.locator(".technical-facts").scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("region", { name: "Datos técnicos del eclipse" }),
  ).toBeVisible();
});

test("opens Help from the bottom of the desktop rail", async ({ page }) => {
  await installDeterministicNetwork(page);
  await page.goto("/?state=1&lang=en&event=2026&layer=none");

  const planner = page.getByRole("complementary", {
    name: "Eclipse map tools",
  });
  await planner.getByRole("button", { name: "Help", exact: true }).click();
  await expect(
    planner.getByRole("heading", { name: "Help", exact: true }),
  ).toBeVisible();
  await expect(planner.getByText("About Eclipse Atlas", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Eclipse planning map", exact: true }),
  ).toBeVisible();

  await planner
    .getByRole("button", { name: "Explore", exact: true })
    .click();
  await expect(
    planner.getByRole("heading", { name: "Explore Spain", exact: true }),
  ).toBeVisible();
});

test("preserves a comparison through history, the live URL and reload", async ({
  page,
}) => {
  await installDeterministicNetwork(page);
  await page.goto("/?state=1&lang=es&event=2026&layer=none");

  const planner = page.getByRole("complementary", {
    name: "Herramientas del mapa del eclipse",
  });
  const search = planner.getByRole("searchbox", {
    name: "Buscar lugares del mapa",
  });
  const selectPlace = async (name: "Soria" | "Burgos") => {
    await search.fill(name);
    await planner
      .getByRole("button", {
        name: new RegExp(`^${name} .* ciudad en totalidad$`),
      })
      .click();
    await expect(
      planner.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
  };

  await selectPlace("Soria");
  await page.goBack();
  await expect(
    planner.getByRole("heading", { name: "Explora España" }),
  ).toBeVisible();
  await page.goForward();
  await expect(
    planner.getByRole("heading", { name: "Soria", exact: true }),
  ).toBeVisible();

  await planner.getByRole("button", { name: "+ Añadir a comparación" }).click();
  await expect(planner.getByRole("button", { name: "Comparar 1" })).toBeVisible();
  await planner.getByRole("button", { name: "Volver a lugares" }).click();
  await expect(
    planner.getByRole("heading", { name: "Explora España", exact: true }),
  ).toBeVisible();
  await selectPlace("Burgos");
  await planner.getByRole("button", { name: "+ Añadir a comparación" }).click();
  await planner.getByRole("button", { name: "Comparar 2" }).click();

  await expect(
    planner.getByRole("article", { name: "Datos de comparación de Soria" }),
  ).toBeVisible();
  await expect(
    planner.getByRole("article", { name: "Datos de comparación de Burgos" }),
  ).toBeVisible();

  await expect(
    page.getByRole("button", { name: "Compartir", exact: true }),
  ).toHaveCount(0);
  const liveState = new URL(page.url());
  expect(liveState.searchParams.getAll("compare")).toHaveLength(2);
  expect(liveState.hash).toBe("#comparison");

  await page.reload();
  await expect(
    planner.getByRole("article", { name: "Datos de comparación de Soria" }),
  ).toBeVisible();
  await planner
    .getByRole("button", { name: "Quitar Soria de la comparación" })
    .click();
  await expect(planner.getByRole("button", { name: "Comparar 1" })).toBeVisible();
  expect(new URL(page.url()).searchParams.getAll("compare")).toHaveLength(1);
});

test("keeps primary mobile controls large enough and honours reduced motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installDeterministicNetwork(page);
  await page.goto(SELECTED_LOCATION_URL);

  const primaryControls = page.locator(
    ".masthead button, .mobile-map-view-picker summary, .mobile-selected-summary__open, .mobile-selected-summary__clear, .mobile-navigation button",
  );
  const sizes = await primaryControls.evaluateAll((elements) =>
    elements
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        return { width: bounds.width, height: bounds.height };
      })
      .filter(({ width, height }) => width > 0 && height > 0),
  );
  expect(sizes.length).toBeGreaterThan(8);
  expect(sizes.every(({ height }) => height >= 44)).toBe(true);

  await page.getByRole("button", { name: "Elegir eclipse" }).click();
  const transitionDurations = await page
    .locator(".event-card, .event-switcher-chevron")
    .evaluateAll((elements) =>
      elements.map((element) => getComputedStyle(element).transitionDuration),
    );
  expect(transitionDurations.every((duration) => duration === "1e-05s")).toBe(true);
  await expectNoHorizontalOverflow(page);
});

test("keeps the illustrated header visually stable", async ({ page }) => {
  await installDeterministicNetwork(page);
  await page.goto("/?state=1&lang=es&event=2026&layer=none");
  await expect(page.locator(".masthead-art")).toHaveCSS(
    "background-image",
    /eclipse-atlas-header-1600\.webp/,
  );
  await expect(page.locator(".masthead")).toHaveScreenshot(
    "eclipse-atlas-header-desktop.webp",
    {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.005,
    },
  );
  await expect(page.locator(".place-filters")).toHaveCount(0);
  await expect(page.locator(".planner-rail")).toHaveScreenshot(
    "planner-rail-desktop.webp",
    {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.005,
    },
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?state=1&lang=es&event=2026&layer=none");
  await expect(page.locator(".masthead-art")).toBeHidden();
  await expect(page.locator(".masthead")).toHaveScreenshot(
    "eclipse-atlas-header-mobile.webp",
    {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.005,
    },
  );
});
