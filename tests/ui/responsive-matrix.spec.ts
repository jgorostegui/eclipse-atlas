import { expect, test } from "@playwright/test";
import {
  collectBrowserErrors,
  installDeterministicNetwork,
} from "./support/network-fixtures";

const BURGOS_DETAILS_URL =
  "/?state=1&lang=es&selected=place%3Aburgos&compare=place%3Asoria&layer=none#details";

const phoneViewports = [
  { name: "iPhone SE", width: 320, height: 568 },
  { name: "Galaxy S24", width: 360, height: 780 },
  { name: "iPhone SE 3", width: 375, height: 667 },
  { name: "iPhone 13", width: 390, height: 664 },
  { name: "Pixel 5", width: 393, height: 727 },
  { name: "iPhone 17", width: 402, height: 681 },
  { name: "Pixel 7 Pro", width: 412, height: 816 },
  { name: "Pixel 7", width: 412, height: 839 },
  { name: "iPhone 15 Pro Max", width: 430, height: 739 },
  { name: "mobile cascade boundary", width: 431, height: 739 },
  { name: "iPhone 17 Pro Max", width: 440, height: 763 },
  { name: "iPhone 17 Pro Max expanded chrome", width: 440, height: 956 },
  { name: "Pixel 7 landscape", width: 839, height: 412 },
  { name: "iPhone 15 landscape", width: 844, height: 390 },
] as const;

const largeViewports = [
  { name: "iPad mini portrait", width: 744, height: 1133 },
  { name: "iPad classic portrait", width: 768, height: 1024 },
  { name: "iPad Air portrait", width: 820, height: 1180 },
  { name: "iPad Pro 11 portrait", width: 834, height: 1210 },
  { name: "stacked boundary", width: 900, height: 900 },
  { name: "desktop boundary", width: 901, height: 768 },
  { name: "compact desktop", width: 1024, height: 768 },
  { name: "HD laptop", width: 1280, height: 720 },
  { name: "common laptop", width: 1366, height: 768 },
  { name: "scaled laptop", width: 1536, height: 864 },
  { name: "full HD desktop", width: 1920, height: 1080 },
  { name: "wide desktop", width: 2048, height: 1152 },
] as const;

test("keeps selected-place controls coherent across representative phones", async ({
  browserName,
  page,
}) => {
  await installDeterministicNetwork(page);
  const browserErrors = collectBrowserErrors(page);

  for (const viewport of phoneViewports) {
    await test.step(viewport.name, async () => {
      await page.setViewportSize(viewport);
      await page.goto(BURGOS_DETAILS_URL);
      await expect(page.locator("canvas.horizon-canvas"))
        .toHaveAttribute("data-render-state", "ready");

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
          viewport: { width: window.innerWidth, height: window.innerHeight },
          document: {
            scrollWidth: document.documentElement.scrollWidth,
            scrollHeight: document.documentElement.scrollHeight,
            clientHeight: document.documentElement.clientHeight,
          },
          rootBackground: getComputedStyle(document.documentElement)
            .backgroundColor,
          shell: rect(".planner-shell"),
          detailHeader: rect(".detail-header"),
          back: rect(".detail-back"),
          identity: rect(".detail-header__identity"),
          actions: rect(".detail-header__actions"),
          compare: rect(".compare-toggle"),
          clear: rect(".detail-clear"),
          panel: rect(".detail-evidence-panel--horizon"),
          chart: rect(".horizon-chart-wrap"),
          contacts: rect(".horizon-contact-jumps"),
          controls: rect(".horizon-animation__controls"),
          controlLabel: rect(".horizon-animation__controls label > span"),
          slider: rect(".horizon-animation__controls input"),
          controlTime: rect(".horizon-animation__controls > time"),
          liveFacts: rect(".horizon-live-facts"),
          navigation: rect(".mobile-navigation"),
        };
      });

      expect(geometry.document.scrollWidth, `${viewport.name}: horizontal overflow`)
        .toBeLessThanOrEqual(geometry.viewport.width);
      expect(geometry.document.scrollHeight, `${viewport.name}: document scroll`)
        .toBeLessThanOrEqual(geometry.document.clientHeight + 1);
      expect(geometry.shell.bottom, `${viewport.name}: shell height`)
        .toBeCloseTo(geometry.viewport.height, 0);
      expect(geometry.navigation.bottom, `${viewport.name}: navigation height`)
        .toBeCloseTo(geometry.viewport.height, 0);
      expect(geometry.rootBackground, `${viewport.name}: under-page background`)
        .not.toBe("rgba(0, 0, 0, 0)");

      for (const [name, element] of [
        ["back", geometry.back],
        ["identity", geometry.identity],
        ["actions", geometry.actions],
        ["compare", geometry.compare],
        ["clear", geometry.clear],
      ] as const) {
        expect(element.left, `${viewport.name}: ${name} leaves header on the left`)
          .toBeGreaterThanOrEqual(geometry.detailHeader.left - 1);
        expect(element.right, `${viewport.name}: ${name} leaves header on the right`)
          .toBeLessThanOrEqual(geometry.detailHeader.right + 1);
        expect(element.top, `${viewport.name}: ${name} leaves header above`)
          .toBeGreaterThanOrEqual(geometry.detailHeader.top - 1);
        expect(element.bottom, `${viewport.name}: ${name} leaves header below`)
          .toBeLessThanOrEqual(geometry.detailHeader.bottom + 1);
      }

      expect(
        geometry.controls.top - geometry.contacts.bottom,
        `${viewport.name}: the time control overlaps C1-C4`,
      ).toBeGreaterThanOrEqual(0);
      expect(geometry.chart.left, `${viewport.name}: chart leaves panel on the left`)
        .toBeGreaterThanOrEqual(geometry.panel.left - 1);
      expect(geometry.chart.right, `${viewport.name}: chart leaves panel on the right`)
        .toBeLessThanOrEqual(geometry.panel.right + 1);
      expect(
        geometry.controlLabel.top - geometry.controls.top,
        `${viewport.name}: the time label escapes its control`,
      ).toBeGreaterThanOrEqual(-1);
      expect(
        geometry.slider.top - geometry.controlLabel.bottom,
        `${viewport.name}: the slider overlaps its label`,
      ).toBeGreaterThanOrEqual(-1);
      expect(
        geometry.controls.bottom - geometry.slider.bottom,
        `${viewport.name}: the slider escapes its control`,
      ).toBeGreaterThanOrEqual(-1);
      expect(
        geometry.liveFacts.top - geometry.controls.bottom,
        `${viewport.name}: the position readout overlaps the time control`,
      ).toBeGreaterThanOrEqual(0);

      for (const target of [geometry.back, geometry.compare, geometry.clear]) {
        expect(target.width, `${viewport.name}: target width`)
          .toBeGreaterThanOrEqual(44);
        expect(target.height, `${viewport.name}: target height`)
          .toBeGreaterThanOrEqual(44);
      }

      if (viewport.name === "iPhone 17 Pro Max") {
        expect(
          geometry.navigation.top - geometry.liveFacts.bottom,
          "iPhone 17 Pro Max: navigation hides the horizon instrument",
        ).toBeGreaterThanOrEqual(7.5);
        await expect(page.locator(".planner-shell")).toHaveScreenshot(
          `burgos-iphone-17-pro-max-${browserName}.png`,
          {
            animations: "disabled",
            caret: "hide",
            maxDiffPixelRatio: 0.04,
          },
        );
      }

      await page.locator(".horizon-animation__controls").evaluate((element) => {
        element.scrollIntoView({ block: "end" });
      });
      const visibleControl = await page.locator(".horizon-animation__controls")
        .boundingBox();
      const fixedNavigation = await page.locator(".mobile-navigation")
        .boundingBox();
      if (!visibleControl || !fixedNavigation) {
        throw new Error(`${viewport.name}: missing control geometry after scroll`);
      }
      expect(
        fixedNavigation.y - (visibleControl.y + visibleControl.height),
        `${viewport.name}: navigation covers the time control after scrolling`,
      ).toBeGreaterThanOrEqual(-0.5);
    });
  }

  expect(browserErrors).toEqual([]);
});

test("keeps map and inspector sound across tablets and desktops", async ({
  browserName,
  page,
}) => {
  await installDeterministicNetwork(page);
  const browserErrors = collectBrowserErrors(page);

  for (const viewport of largeViewports) {
    await test.step(viewport.name, async () => {
      await page.setViewportSize(viewport);
      await page.goto(BURGOS_DETAILS_URL);
      await expect(page.locator("canvas.horizon-canvas"))
        .toHaveAttribute("data-render-state", "ready");

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
          };
        };

        return {
          viewport: { width: window.innerWidth, height: window.innerHeight },
          scrollWidth: document.documentElement.scrollWidth,
          shell: rect(".planner-shell"),
          workspace: rect(".planner-workspace"),
          map: rect(".map-panel"),
          rail: rect(".planner-rail"),
          header: rect(".detail-header"),
          identity: rect(".detail-header__identity"),
          actions: rect(".detail-header__actions"),
          clear: rect(".detail-clear"),
          panel: rect(".detail-evidence-panel--horizon"),
          chart: rect(".horizon-chart-wrap"),
          contacts: rect(".horizon-contact-jumps"),
          controls: rect(".horizon-animation__controls"),
          slider: rect(".horizon-animation__controls input"),
          navigationDisplay: getComputedStyle(
            document.querySelector<HTMLElement>(".mobile-navigation")!,
          ).display,
          mapDisplay: getComputedStyle(
            document.querySelector<HTMLElement>(".map-panel")!,
          ).display,
        };
      });

      expect(geometry.scrollWidth, `${viewport.name}: horizontal overflow`)
        .toBeLessThanOrEqual(geometry.viewport.width);
      expect(geometry.shell.bottom, `${viewport.name}: shell height`)
        .toBeCloseTo(geometry.viewport.height, 0);
      if (viewport.width > 900) {
        const railRatio = geometry.rail.width / geometry.workspace.width;
        expect(
          railRatio,
          `${viewport.name}: inspector takes too much horizontal space`,
        ).toBeLessThanOrEqual(0.42);
        expect(
          geometry.map.width,
          `${viewport.name}: map is not the primary surface`,
        ).toBeGreaterThan(geometry.rail.width);
        if (viewport.width >= 1280) {
          expect(
            railRatio,
            `${viewport.name}: wide layout does not adapt the inspector`,
          ).toBeLessThanOrEqual(0.345);
        }
      }
      expect(geometry.actions.right, `${viewport.name}: actions leave header`)
        .toBeLessThanOrEqual(geometry.header.right + 1);
      expect(geometry.clear.right, `${viewport.name}: clear leaves header`)
        .toBeLessThanOrEqual(geometry.header.right + 1);
      expect(geometry.identity.right - geometry.identity.left, `${viewport.name}: place name is squeezed out`)
        .toBeGreaterThanOrEqual(100);
      expect(geometry.chart.left, `${viewport.name}: chart leaves panel on the left`)
        .toBeGreaterThanOrEqual(geometry.panel.left - 1);
      expect(geometry.chart.right, `${viewport.name}: chart leaves panel on the right`)
        .toBeLessThanOrEqual(geometry.panel.right + 1);
      expect(
        geometry.controls.top - geometry.contacts.bottom,
        `${viewport.name}: time control overlaps contacts`,
      ).toBeGreaterThanOrEqual(0);
      expect(geometry.slider.top, `${viewport.name}: slider leaves control above`)
        .toBeGreaterThanOrEqual(geometry.controls.top - 1);
      expect(geometry.slider.bottom, `${viewport.name}: slider leaves control below`)
        .toBeLessThanOrEqual(geometry.controls.bottom + 1);

      if (viewport.width <= 900) {
        expect(geometry.navigationDisplay).toBe("grid");
        expect(geometry.mapDisplay).toBe("none");
      } else {
        expect(geometry.navigationDisplay).toBe("none");
        expect(geometry.mapDisplay).not.toBe("none");
      }

      if (viewport.name === "common laptop") {
        await expect(page.locator(".planner-shell")).toHaveScreenshot(
          `burgos-common-laptop-${browserName}.png`,
          {
            animations: "disabled",
            caret: "hide",
            maxDiffPixelRatio: 0.04,
          },
        );
      }
    });
  }

  expect(browserErrors).toEqual([]);
});
