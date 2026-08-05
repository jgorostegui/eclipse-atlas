import { expect, test } from "@playwright/test";
import {
  collectBrowserErrors,
  installDeterministicNetwork,
} from "./support/network-fixtures";

test("loads a deep link from a static deployment subpath", async ({ page }) => {
  await installDeterministicNetwork(page);
  const browserErrors = collectBrowserErrors(page);
  const failedLocalResources: string[] = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (
      url.origin === "http://127.0.0.1:4173" &&
      response.status() >= 400
    ) {
      failedLocalResources.push(`${response.status()} ${url.pathname}`);
    }
  });

  await page.goto(
    "/eclipse/?state=1&lang=en&selected=place%3Asoria&layer=none#map",
  );

  await expect(page.getByRole("heading", { name: "Soria" })).toBeVisible();
  await expect(
    page.getByRole("region", {
      name: "Eclipse data for the selected point",
    }),
  ).toContainText("100%");
  expect(failedLocalResources).toEqual([]);
  expect(browserErrors).toEqual([]);
});
