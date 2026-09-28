import type { Page } from "playwright/test";

export function selectedBackground(page: Page, accent: string) {
  return page.evaluate((value) => {
    const probe = document.createElement("span");
    probe.style.backgroundColor = `color-mix(in srgb, ${value} 14%, transparent)`;
    document.body.append(probe);
    const result = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return result;
  }, accent);
}
