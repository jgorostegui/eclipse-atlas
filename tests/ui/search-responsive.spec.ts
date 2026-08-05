import { expect, test } from "@playwright/test";
import {
  collectBrowserErrors,
  installDeterministicNetwork,
} from "./support/network-fixtures";
import {
  installVisualViewport,
  setVisualViewportHeight,
} from "./support/visual-viewport";

const PLACES_URL = "/?state=1&lang=es&event=2026&layer=none#places";

const representativePhones = [
  { name: "iPhone SE", width: 320, height: 568 },
  { name: "iPhone 17", width: 402, height: 681 },
  { name: "iPhone 17 Pro Max", width: 440, height: 763 },
] as const;

test("puts results first on focus even without a keyboard resize event", async ({
  page,
}) => {
  await installDeterministicNetwork(page);
  const browserErrors = collectBrowserErrors(page);

  for (const viewport of representativePhones) {
    await test.step(viewport.name, async () => {
      await page.setViewportSize(viewport);
      await page.goto(PLACES_URL);

      const search = page.getByRole("searchbox", {
        name: "Buscar lugares del mapa",
      });
      const textInputFontSizes = await page
        .locator(
          'input:is([type="search"], [type="text"], [type="email"], [type="number"], [type="tel"], [type="url"], :not([type]))',
        )
        .evaluateAll((inputs) =>
          inputs.map((input) =>
            Number.parseFloat(window.getComputedStyle(input).fontSize),
          ),
        );
      expect(
        textInputFontSizes.every((fontSize) => fontSize >= 16),
        `${viewport.name}: a text input can trigger iOS focus zoom`,
      ).toBe(true);
      await search.focus();
      await search.fill("Medi");

      await expect(page.locator(".planner-shell")).toHaveAttribute(
        "data-search-active",
        "true",
      );
      await expect(page.locator(".masthead")).toBeHidden();
      await expect(page.locator(".mobile-navigation")).toBeHidden();
      await expect(page.locator(".explorer-heading")).toBeHidden();
      await expect(page.locator(".place-filters")).toHaveCount(0);
      await expect(page.locator(".place-list-heading")).toBeHidden();

      const back = page.getByRole("button", { name: "Cerrar búsqueda" });
      const clear = page.getByRole("button", { name: "Borrar búsqueda" });
      const results = page.locator(".place-list button[data-candidate-id]");
      await expect(back).toBeVisible();
      await expect(clear).toBeVisible();
      await expect(results).toHaveCount(3);

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
        const resultBounds = [
          ...document.querySelectorAll<HTMLElement>(
            ".place-list button[data-candidate-id]",
          ),
        ].map((element) => {
          const bounds = element.getBoundingClientRect();
          return { top: bounds.top, bottom: bounds.bottom, height: bounds.height };
        });
        return {
          search: rect(".place-search"),
          list: rect(".place-list"),
          back: rect(".place-search__back"),
          clear: rect(".place-search__clear"),
          results: resultBounds,
          viewportWidth: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
        };
      });

      expect(
        geometry.list.top - geometry.search.bottom,
        `${viewport.name}: list is not adjacent to search`,
      ).toBeLessThanOrEqual(1);
      expect(
        geometry.results[0]?.top ?? Number.POSITIVE_INFINITY,
        `${viewport.name}: first result is not immediately available`,
      ).toBeLessThanOrEqual(geometry.search.bottom + 1);
      expect(
        geometry.results[2]?.bottom ?? Number.POSITIVE_INFINITY,
        `${viewport.name}: three results do not fit above a typical keyboard`,
      ).toBeLessThanOrEqual(300);
      expect(geometry.back.width).toBeGreaterThanOrEqual(44);
      expect(geometry.back.height).toBeGreaterThanOrEqual(44);
      expect(geometry.clear.width).toBeGreaterThanOrEqual(44);
      expect(geometry.clear.height).toBeGreaterThanOrEqual(44);
      expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewportWidth);

      await clear.click();
      await expect(search).toHaveValue("");
      await expect(search).toBeFocused();
      await expect(page.locator(".planner-shell")).toHaveAttribute(
        "data-search-active",
        "true",
      );

      await back.click();
      await expect(page.locator(".planner-shell")).not.toHaveAttribute(
        "data-search-active",
        "true",
      );
      await expect(page.locator(".masthead")).toBeVisible();
      await expect(page.locator(".mobile-navigation")).toBeVisible();
      await expect(page.locator(".place-filters")).toHaveCount(0);
    });
  }

  expect(browserErrors).toEqual([]);
});

test("keeps the selected result usable when the visual viewport also shrinks", async ({
  page,
}) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await installVisualViewport(page, 699);
  await installDeterministicNetwork(page);
  await page.goto(PLACES_URL);

  const search = page.getByRole("searchbox", {
    name: "Buscar lugares del mapa",
  });
  await search.focus();
  await setVisualViewportHeight(page, 390);
  await search.fill("Burgos neutral control");

  const result = page.locator(
    '.place-list button[data-candidate-id="burgos-neutral-control"]',
  );
  await expect(result).toBeVisible();
  await expect(page.locator(".planner-shell")).toHaveCSS("height", "390px");
  await expect(page.locator(".place-filters")).toHaveCount(0);

  await result.click();
  await expect(
    page.getByRole("heading", { name: "Burgos neutral control", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".planner-shell")).not.toHaveAttribute(
    "data-search-active",
    "true",
  );
});
