import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  collectBrowserErrors,
  installDeterministicNetwork,
} from "./support/network-fixtures";
import { installVisualViewport } from "./support/visual-viewport";

const BURGOS_URL = "/?state=1&lang=es&layer=none";
const SORIA_URL = "/?state=1&lang=es&selected=place%3Asoria&layer=none";
const ALTO_LA_CRUZ_DETAILS_URL =
  "/?state=1&lang=es&selected=place%3Aalto-la-cruz-viewpoint&layer=none#details";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

type Bounds = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
};

async function readMobileFrame(page: Page) {
  return page.evaluate(() => {
    const bounds = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`Missing ${selector}`);
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      } satisfies Bounds;
    };

    return {
      viewportHeight: window.innerHeight,
      visualViewportHeight: window.visualViewport?.height ?? window.innerHeight,
      windowScrollY: window.scrollY,
      documentClientHeight: document.documentElement.clientHeight,
      documentScrollHeight: document.documentElement.scrollHeight,
      documentOverflowY: getComputedStyle(document.documentElement).overflowY,
      bodyOverflowY: getComputedStyle(document.body).overflowY,
      rootOverflowY: getComputedStyle(
        document.querySelector<HTMLElement>("#root")!,
      ).overflowY,
      shell: bounds(".planner-shell"),
      header: bounds(".masthead"),
      workspace: bounds(".planner-workspace"),
      detailHeader: bounds(".detail-header"),
      outcome: bounds(".eclipse-outcome"),
      tabs: bounds(".detail-evidence-tabs"),
      panel: bounds(".detail-evidence-panel--horizon"),
      chart: bounds(".horizon-chart-wrap"),
      controls: bounds(".horizon-animation__controls"),
      navigation: bounds(".mobile-navigation"),
    };
  });
}

function expectMobileFrameToFillViewport(frame: Awaited<ReturnType<typeof readMobileFrame>>) {
  expect(frame.windowScrollY).toBe(0);
  expect(frame.documentScrollHeight).toBeLessThanOrEqual(
    frame.documentClientHeight + 1,
  );
  expect(frame.documentOverflowY).toBe("hidden");
  expect(frame.bodyOverflowY).toBe("hidden");
  expect(frame.rootOverflowY).toBe("hidden");
  expect(Math.abs(frame.shell.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(frame.shell.bottom - frame.visualViewportHeight)).toBeLessThanOrEqual(1);
  expect(Math.abs(frame.workspace.top - frame.header.bottom)).toBeLessThanOrEqual(1);
  expect(Math.abs(frame.workspace.bottom - frame.navigation.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(frame.navigation.bottom - frame.visualViewportHeight)).toBeLessThanOrEqual(1);
}

async function canvasState(horizon: Locator) {
  return horizon.locator("canvas.horizon-canvas").evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    return {
      renderer: canvas.dataset.renderer,
      renderState: canvas.dataset.renderState,
      terrainSignature: canvas.dataset.terrainSignature,
      phase: canvas.dataset.phase,
      clearanceBracket: canvas.dataset.clearanceBracket,
      skyUpper: canvas.dataset.skyUpper,
      sunX: Number(canvas.dataset.sunX),
      insetOffset: Number(canvas.dataset.insetOffset),
      contextAvailable: canvas.getContext("2d") !== null,
      cssWidth: canvas.clientWidth,
      cssHeight: canvas.clientHeight,
      backingWidth: canvas.width,
      backingHeight: canvas.height,
    };
  });
}

async function selectBurgosFromPlanner(page: Page) {
  const planner = page.getByRole("complementary", {
    name: "Herramientas del mapa del eclipse",
  });
  const search = planner.getByRole("searchbox", {
    name: "Buscar lugares del mapa",
  });
  await search.fill("Burgos");
  await planner
    .getByRole("button", {
      name: "Burgos Castilla y León ciudad en totalidad",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Burgos", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/selected=place%3Aburgos/);
}

test("keeps the real terrain profile stable through C1–C4 and across reloads", async ({
  page,
}) => {
  await installDeterministicNetwork(page);
  const browserErrors = collectBrowserErrors(page);
  await page.goto(BURGOS_URL);
  await selectBurgosFromPlanner(page);

  const facts = page.getByRole("region", {
    name: "Datos del eclipse para el punto seleccionado",
  });
  await expect(facts.getByText("100%", { exact: true })).toBeVisible();
  await expect(facts.getByText("Eclipse total", { exact: true })).toBeVisible();
  await expect(
    facts.getByText("totalidad · 1 min 44 s", { exact: true }),
  ).toBeVisible();
  await expect(facts).toContainText("Horizonte");
  await expect(facts).toContainText("Nubes");

  const horizon = page.getByRole("region", { name: "Horizonte oeste" });
  const chart = horizon.locator("canvas.horizon-canvas");
  await expect(chart).toBeVisible();
  await expect(chart).toHaveAttribute("data-render-state", "ready");
  await expect(horizon.getByText("Relieve IGN/CNIG", { exact: true }))
    .toBeVisible();
  await expect(horizon.locator(".horizon-contact-jumps button")).toHaveCount(5);
  await expect(page.getByRole("tab", { name: "Datos", exact: true }))
    .toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reproducir", exact: true }))
    .toHaveCount(0);
  await expect(page.locator(".technical-facts > summary")).toHaveCount(0);

  const technicalFacts = page.locator(".technical-facts");
  await expect(technicalFacts).toBeVisible();
  await expect(technicalFacts).toContainText("Contactos");
  await expect(technicalFacts).toContainText("C1 · empieza la parcialidad");
  await expect(technicalFacts).toContainText("C4 · termina la parcialidad");
  await expect(technicalFacts).toContainText("Sol en el máximo");
  await expect(technicalFacts).toContainText(/magnitud/i);
  await expect(technicalFacts).toContainText(/elevación del terreno/i);
  const terrainEvidence = page.locator(".technical-evidence");
  await expect(terrainEvidence).toContainText("Rayo limitante del relieve");
  await expect(terrainEvidence).toContainText(
    /azimut \d+,\d° · distancia \d+,\d km/,
  );
  await expect(terrainEvidence).toContainText(
    "No modela vegetación, edificios ni obstáculos temporales.",
  );
  await horizon.getByRole("button", { name: /C1 · empieza/ }).click();
  await expect(chart).toHaveAttribute("data-phase", "partial");

  const maximumButton = horizon.getByRole("button", { name: /Máximo/ });
  const c1Button = horizon.getByRole("button", { name: /C1 · empieza/ });
  const c2Button = horizon.getByRole("button", { name: /C2 · empieza/ });
  const c4Button = horizon.getByRole("button", { name: /C4 · termina/ });
  await maximumButton.click();
  await expect(chart).toHaveAttribute("data-phase", "total");
  await expect(maximumButton).toHaveAttribute("aria-pressed", "true");
  const burgosMaximumLabel = await maximumButton.getAttribute("aria-label");
  const maximumClearance = await horizon.locator(".horizon-primary strong")
    .innerText();
  expect(maximumClearance).toBe("+7,3°");
  const maximum = await canvasState(horizon);
  expect(maximum).toMatchObject({
    renderer: "canvas-2d",
    renderState: "ready",
    phase: "total",
    clearanceBracket: "visible",
    contextAvailable: true,
  });
  expect(maximum.terrainSignature).toMatch(/^[0-9a-f]{8}$/);
  expect(maximum.backingWidth).toBeGreaterThanOrEqual(maximum.cssWidth);
  expect(maximum.backingHeight).toBeGreaterThanOrEqual(maximum.cssHeight);
  await expect(horizon).toHaveScreenshot("burgos-horizon-maximum.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.04,
  });

  await c1Button.click();
  await expect(chart).toHaveAttribute("data-phase", "partial");
  const c1 = await canvasState(horizon);
  expect(c1.terrainSignature).toBe(maximum.terrainSignature);
  expect(c1.clearanceBracket).toBe("hidden");
  expect(c1.skyUpper).not.toBe(maximum.skyUpper);
  expect(c1.sunX).toBeGreaterThanOrEqual(0);
  expect(c1.sunX).toBeLessThanOrEqual(c1.cssWidth);

  await c2Button.click();
  await expect(chart).toHaveAttribute("data-phase", "total");
  await c4Button.click();
  await expect(chart).toHaveAttribute("data-phase", "partial");
  const c4 = await canvasState(horizon);
  expect(c4.terrainSignature).toBe(maximum.terrainSignature);
  expect(c1.insetOffset * c4.insetOffset).toBeLessThan(0);
  expect(await horizon.locator(".horizon-primary strong").innerText()).toBe(
    maximumClearance,
  );

  await page
    .getByRole("region", { name: "Mapa para planificar el eclipse" })
    .getByRole("button", { name: "Alto la Cruz", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Mirador Alto la Cruz", exact: true }),
  ).toBeVisible();
  const altoHorizon = page.getByRole("region", { name: "Horizonte oeste" });
  await expect(altoHorizon.locator("canvas.horizon-canvas"))
    .toHaveAttribute("data-render-state", "ready");
  const alto = await canvasState(altoHorizon);
  expect(alto.terrainSignature).not.toBe(maximum.terrainSignature);
  expect(
    await altoHorizon.getByRole("button", { name: /Máximo/ })
      .getAttribute("aria-label"),
  ).not.toBe(burgosMaximumLabel);

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Mirador Alto la Cruz", exact: true }),
  ).toBeVisible();
  const reloaded = page.getByRole("region", { name: "Horizonte oeste" });
  await expect(reloaded.locator("canvas.horizon-canvas"))
    .toHaveAttribute("data-render-state", "ready");
  expect((await canvasState(reloaded)).terrainSignature).toBe(
    alto.terrainSignature,
  );
  expect(browserErrors).toEqual([]);
});

test("reveals the central phase once and exposes optional calculated sky context", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installDeterministicNetwork(page);
  const browserErrors = collectBrowserErrors(page);
  await page.goto(SORIA_URL);

  const horizon = page.getByRole("region", { name: "Horizonte oeste" });
  const chart = horizon.locator("canvas.horizon-canvas");
  await expect(chart).toHaveAttribute("data-render-state", "ready");
  await expect(
    horizon.getByRole("button", { name: "Pausar animación del horizonte" }),
  ).toBeVisible();
  await expect(
    horizon.getByRole("button", { name: /Máximo ·/ }),
  ).toHaveAttribute("aria-pressed", "true", { timeout: 9_000 });
  await expect(
    horizon.getByRole("button", {
      name: "Repetir animación de la fase central",
    }),
  ).toBeVisible();

  const sky = horizon.getByRole("button", { name: "Mostrar cielo calculado" });
  await sky.click();
  await expect(sky).toHaveAttribute("aria-pressed", "true");
  await expect(chart).toHaveAttribute("data-celestial-count", "13");

  expect(browserErrors).toEqual([]);
});

test("restores the Punta del Pozacu deep link with exact contact timing", async ({
  page,
}) => {
  await installDeterministicNetwork(page);
  const browserErrors = collectBrowserErrors(page);
  await page.goto(
    "/?state=1&lang=es&selected=place%3APunta-del-pozacu-viewpoint&layer=totality-duration#map",
  );

  await expect(
    page.getByRole("heading", {
      name: "Mirador Punta d'El Pozacu",
      exact: true,
    }),
  ).toBeVisible();
  const horizon = page.getByRole("region", { name: "Horizonte oeste" });
  await expect(horizon.locator("canvas.horizon-canvas"))
    .toHaveAttribute("data-render-state", "ready");
  await expect(horizon.getByRole("button", { name: /C2.*20:26:48/ }))
    .toBeVisible();
  await expect(horizon.getByRole("button", { name: /Máximo.*20:27:42/ }))
    .toBeVisible();
  await expect(horizon.getByRole("button", { name: /C3.*20:28:36/ }))
    .toBeVisible();
  const signature = (await canvasState(horizon)).terrainSignature;
  await horizon.getByRole("button", { name: /C1 · empieza/ }).click();
  expect((await canvasState(horizon)).terrainSignature).toBe(signature);
  expect(browserErrors).toEqual([]);
});

test("keeps the horizon usable at 390 by 844", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installDeterministicNetwork(page);
  const browserErrors = collectBrowserErrors(page);
  await page.goto("/?state=1&lang=es&selected=place%3Aburgos&layer=none");
  await page.getByRole("button", { name: "Abrir los detalles de Burgos" })
    .click();

  const horizon = page.getByRole("region", { name: "Horizonte oeste" });
  const chart = horizon.locator("canvas.horizon-canvas");
  await expect(chart).toHaveAttribute("data-render-state", "ready");
  const controlsBox = await horizon.locator(".horizon-animation__controls")
    .boundingBox();
  const navigationBox = await page.locator(".mobile-navigation").boundingBox();
  if (!controlsBox || !navigationBox) {
    throw new Error("Expected measurable mobile horizon controls.");
  }
  expect(navigationBox.y - (controlsBox.y + controlsBox.height))
    .toBeGreaterThanOrEqual(7.5);
  const contactButtons = horizon.locator(".horizon-contact-jumps button");
  await expect(contactButtons).toHaveCount(5);
  for (const button of await contactButtons.all()) {
    const box = await button.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await horizon.getByRole("button", { name: /C1 · empieza/ }).click();
  await expect(chart).toHaveAttribute("data-phase", "partial");
  await horizon.getByRole("button", { name: /C2 · empieza/ }).click();
  await expect(chart).toHaveAttribute("data-phase", "total");
  await expect(horizon.locator(".horizon-primary strong")).toHaveText("+7,3°");
  await expect(horizon).toHaveScreenshot("burgos-horizon-mobile.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.04,
  });
  expect(browserErrors).toEqual([]);
});

test("keeps the complete time control above the mobile navigation", async ({
  page,
}) => {
  await installDeterministicNetwork(page);

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 375, height: 812 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(ALTO_LA_CRUZ_DETAILS_URL);
    await expect(page.locator("canvas.horizon-canvas"))
      .toHaveAttribute("data-render-state", "ready");

    const frame = await readMobileFrame(page);
    expectMobileFrameToFillViewport(frame);
    expect(
      frame.navigation.top - frame.controls.bottom,
      `${viewport.width}x${viewport.height}: the time control is clipped by navigation`,
    ).toBeGreaterThanOrEqual(7.5);
    expect(frame.controls.top).toBeGreaterThanOrEqual(frame.panel.top);
    expect(frame.detailHeader.height).toBeLessThanOrEqual(94);
    expect(frame.outcome.height).toBeLessThanOrEqual(90);
    expect(frame.tabs.height).toBeGreaterThanOrEqual(44);
    expect(frame.tabs.height).toBeLessThanOrEqual(46);
    expect(frame.chart.height).toBeGreaterThanOrEqual(160);
    expect(frame.controls.height).toBeGreaterThanOrEqual(44);
  }
});

test("fits the complete horizon instrument in the visible iPhone viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await installVisualViewport(page, 699);
  await installDeterministicNetwork(page);
  await page.goto(ALTO_LA_CRUZ_DETAILS_URL);
  await expect(page.locator("canvas.horizon-canvas"))
    .toHaveAttribute("data-render-state", "ready");

  const panel = page.locator(".detail-evidence-panel--horizon");
  const navigation = page.locator(".mobile-navigation");
  const instrumentEnd = page.locator(".horizon-live-facts");
  const panelBox = await panel.boundingBox();
  const navigationBox = await navigation.boundingBox();
  const instrumentEndBox = await instrumentEnd.boundingBox();
  if (!panelBox || !navigationBox || !instrumentEndBox) {
    throw new Error("Expected measurable iPhone horizon geometry.");
  }

  expect(await panel.evaluate((element) => element.scrollTop)).toBe(0);
  expect(instrumentEndBox.y).toBeGreaterThanOrEqual(panelBox.y);
  expect(
    navigationBox.y - (instrumentEndBox.y + instrumentEndBox.height),
    "the horizon instrument is clipped by navigation",
  ).toBeGreaterThanOrEqual(7.5);

  const targets = [
    page.locator(".detail-back"),
    page.locator(".detail-clear"),
    page.locator(".detail-header__actions .compare-toggle"),
    ...await page.locator(".horizon-contact-jumps button").all(),
    page.getByRole("slider", { name: "Elegir un momento del eclipse" }),
  ];
  for (const target of targets) {
    const box = await target.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }

  const frame = await readMobileFrame(page);
  expectMobileFrameToFillViewport(frame);
  expect(frame.viewportHeight).toBe(874);
  expect(frame.shell.height).toBe(699);
  await expect(page.locator(".planner-shell")).toHaveScreenshot(
    "alto-la-cruz-short-mobile.png",
    {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.04,
    },
  );
});

test("keeps document, masthead and navigation fixed while Horizon scrolls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installDeterministicNetwork(page);
  await page.goto(ALTO_LA_CRUZ_DETAILS_URL);
  await expect(page.locator("canvas.horizon-canvas"))
    .toHaveAttribute("data-render-state", "ready");

  const panel = page.locator(".detail-evidence-panel--horizon");
  const before = await readMobileFrame(page);
  expectMobileFrameToFillViewport(before);
  await expect(panel).toHaveCSS("overscroll-behavior-y", "contain");

  await page.locator(".masthead").hover();
  await page.mouse.wheel(0, 400);
  expect((await readMobileFrame(page)).windowScrollY).toBe(0);
  expect(await panel.evaluate((element) => element.scrollTop)).toBe(0);

  await panel.hover();
  await page.mouse.wheel(0, 500);
  await expect.poll(() => panel.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);

  const afterPanelScroll = await readMobileFrame(page);
  expectMobileFrameToFillViewport(afterPanelScroll);
  expect(Math.abs(afterPanelScroll.header.top - before.header.top))
    .toBeLessThanOrEqual(1);
  expect(Math.abs(afterPanelScroll.navigation.top - before.navigation.top))
    .toBeLessThanOrEqual(1);
  expect(
    await page.evaluate(() => {
      const selectors = [
        "#root",
        ".planner-shell",
        ".planner-workspace",
        ".planner-rail",
        ".detail-panel",
        ".detail-evidence-panels",
      ];
      return selectors.map((selector) => ({
        selector,
        scrollTop: document.querySelector<HTMLElement>(selector)?.scrollTop ?? 0,
      }));
    }),
  ).toEqual([
    { selector: "#root", scrollTop: 0 },
    { selector: ".planner-shell", scrollTop: 0 },
    { selector: ".planner-workspace", scrollTop: 0 },
    { selector: ".planner-rail", scrollTop: 0 },
    { selector: ".detail-panel", scrollTop: 0 },
    { selector: ".detail-evidence-panels", scrollTop: 0 },
  ]);

  await panel.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await panel.hover();
  await page.mouse.wheel(0, 500);
  await page.evaluate(() => window.scrollTo(0, 200));
  expectMobileFrameToFillViewport(await readMobileFrame(page));

  await page.locator(".mobile-navigation").hover();
  await page.mouse.wheel(0, 400);
  expectMobileFrameToFillViewport(await readMobileFrame(page));
});

test("keeps the stacked iPad frame filled when the viewport height changes", async ({
  page,
}) => {
  await installDeterministicNetwork(page);

  for (const height of [1180, 1024]) {
    await page.setViewportSize({ width: 820, height });
    if (page.url() === "about:blank") {
      await page.goto(ALTO_LA_CRUZ_DETAILS_URL);
    }
    await expect(page.locator("canvas.horizon-canvas"))
      .toHaveAttribute("data-render-state", "ready");
    const frame = await readMobileFrame(page);
    expectMobileFrameToFillViewport(frame);
  }
});

test("fills the portrait iPad panel without an unrendered lower area", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 1366 });
  await installDeterministicNetwork(page);
  await page.goto(BURGOS_URL);
  await selectBurgosFromPlanner(page);

  const panel = page.locator(".detail-evidence-panel--horizon");
  const chart = panel.locator(".horizon-chart-wrap");
  const footer = panel.locator(".location-footer");
  await expect(panel.locator("canvas.horizon-canvas"))
    .toHaveAttribute("data-render-state", "ready");
  const panelBox = await panel.boundingBox();
  const chartBox = await chart.boundingBox();
  const footerBox = await footer.boundingBox();
  if (!panelBox || !chartBox || !footerBox) {
    throw new Error("Expected measurable iPad horizon geometry.");
  }
  expect(panelBox.y + panelBox.height - (footerBox.y + footerBox.height))
    .toBeLessThan(3);
  expect(chartBox.height).toBeGreaterThan(450);
  expect(await page.evaluate(() => document.documentElement.scrollWidth))
    .toBe(1024);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= window.innerHeight + 1,
    ),
  ).toBe(true);
  const shellBox = await page.locator(".planner-shell").boundingBox();
  expect(Math.abs((shellBox?.y ?? 0) + (shellBox?.height ?? 0) - 1366))
    .toBeLessThanOrEqual(1);
});

test("fails closed on TerrainRGB no-data without unmounting the planner", async ({
  page,
}) => {
  await installDeterministicNetwork(page, "no-data");
  const browserErrors = collectBrowserErrors(page);
  await page.goto(SORIA_URL);

  await expect(
    page.getByRole("heading", { name: "Soria", exact: true }),
  ).toBeVisible();
  const horizon = page.getByRole("region", { name: "Horizonte oeste" });
  await expect(
    horizon.getByText("Modelo de terreno no disponible", { exact: true }),
  ).toBeVisible();
  await expect(
    horizon.getByText(
      "La altura del terreno no está disponible; la geometría y el margen quedan desconocidos.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(horizon.locator("canvas.horizon-canvas")).toHaveCount(0);
  await page.locator(".technical-facts").scrollIntoViewIfNeeded();
  await expect(page.getByText("Altura del terreno no disponible", { exact: true }))
    .toBeVisible();
  await expect(
    page.getByRole("region", { name: "Mapa para planificar el eclipse" }),
  ).toBeVisible();
  expect(browserErrors).toEqual([]);
});
