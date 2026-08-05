import type { Page } from "@playwright/test";

export async function installVisualViewport(
  page: Page,
  initialHeight: number,
) {
  await page.addInitScript((height) => {
    let currentHeight = height;
    const viewport = new EventTarget();
    Object.defineProperties(viewport, {
      height: { get: () => currentHeight },
      width: { get: () => window.innerWidth },
      scale: { get: () => 1 },
      offsetLeft: { get: () => 0 },
      offsetTop: { get: () => 0 },
      pageLeft: { get: () => 0 },
      pageTop: { get: () => 0 },
    });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: viewport,
    });
    Object.defineProperty(window, "__setTestVisualViewportHeight", {
      configurable: true,
      value: (nextHeight: number) => {
        currentHeight = nextHeight;
        viewport.dispatchEvent(new Event("resize"));
      },
    });
  }, initialHeight);
}

export async function setVisualViewportHeight(page: Page, height: number) {
  await page.evaluate((nextHeight) => {
    const testWindow = window as Window & {
      __setTestVisualViewportHeight: (value: number) => void;
    };
    testWindow.__setTestVisualViewportHeight(nextHeight);
  }, height);
}
