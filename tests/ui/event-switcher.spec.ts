import { expect, test } from "@playwright/test";
import {
  collectBrowserErrors,
  installDeterministicNetwork,
} from "./support/network-fixtures";

test("loads the 2027 eclipse as a complete planner state", async ({ page }) => {
  await installDeterministicNetwork(page);
  const browserErrors = collectBrowserErrors(page);

  await page.goto(
    "/?state=1&lang=es&event=2027&selected=place%3Aceuta&layer=totality-duration#map",
  );

  await expect(page).toHaveTitle("2 AGO 2027 · Eclipse Atlas");
  await expect(
    page.getByRole("heading", { name: "Ceuta", exact: true }),
  ).toBeVisible();
  const facts = page.getByRole("region", {
    name: "Datos del eclipse para el punto seleccionado",
  });
  await expect(facts).toContainText("total");
  await expect(facts).toContainText("4 min 48 s");
  await expect(page).toHaveURL(/event=2027/);
  await expect(page).toHaveURL(/selected=place%3Aceuta/);
  await expect(browserErrors).toEqual([]);
});

test("switches to the 2028 annular eclipse without leaving the map", async ({
  page,
}) => {
  await installDeterministicNetwork(page);
  const browserErrors = collectBrowserErrors(page);
  await page.goto(
    "/?state=1&lang=es&event=2027&selected=place%3Aseville&layer=totality-duration#map",
  );

  await page.getByRole("button", { name: "Elegir eclipse" }).click();
  const events = page.getByRole("region", { name: "Eclipses en España" });
  await expect(events).toContainText(
    "Usa el mismo mapa y las mismas herramientas de horizonte para los tres eventos.",
  );
  await events.getByRole("button", { name: /2028/ }).click();

  await expect(page).toHaveTitle("26 ENE 2028 · Eclipse Atlas");
  await expect(page).toHaveURL(/event=2028/);
  await expect(page).toHaveURL(/selected=place%3Aseville/);
  await expect(
    page.getByRole("heading", { name: "Sevilla", exact: true }),
  ).toBeVisible();
  const facts = page.getByRole("region", {
    name: "Datos del eclipse para el punto seleccionado",
  });
  await expect(facts).toContainText("anular");
  await expect(facts).toContainText(/7 min 1[45] s/);
  await page
    .locator(".mobile-map-view-picker.is-desktop-visible > summary")
    .click();
  await expect(
    page.getByRole("button", { name: "Duración de la anularidad" }),
  ).toBeVisible();
  await expect(browserErrors).toEqual([]);
});

test("keeps all three event choices usable without horizontal overflow on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installDeterministicNetwork(page);
  const browserErrors = collectBrowserErrors(page);
  await page.goto("/?state=1&lang=en&event=2026&layer=none");

  const trigger = page.getByRole("button", { name: "Choose eclipse" });
  await expect(trigger).toBeVisible();
  await trigger.click();

  const events = page.getByRole("region", { name: "Spanish eclipse events" });
  await expect(events).toBeVisible();
  const choices = events.locator("button.event-card");
  await expect(choices).toHaveCount(3);
  const heights = await choices.evaluateAll((buttons) =>
    buttons.map((button) => button.getBoundingClientRect().height),
  );
  expect(heights.every((height) => height >= 44)).toBe(true);
  await events.getByRole("button", { name: /2028/ }).click();
  await expect(page).toHaveURL(/event=2028/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(browserErrors).toEqual([]);
});
