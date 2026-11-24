import { expect } from "playwright/test";
import type { Page } from "playwright";

export async function captureWorkspaceTransition(page: Page) {
  return page.evaluateHandle(() => {
    const grid = document.querySelector<HTMLElement>(".workspace-layout-grid")!;
    const surface = document.querySelector<HTMLElement>(
      ".workspace-files-content",
    )!;
    const header = document.querySelector<HTMLElement>(
      "[data-header-files-region]",
    )!;
    const animations: CSSTransition[] = [];
    const capture = () => {
      const candidates = [
        ...grid.getAnimations(),
        ...surface.getAnimations(),
        ...header.getAnimations({ subtree: true }),
      ];
      for (const animation of candidates) {
        if (!(animation instanceof CSSTransition)) continue;
        const effect = animation.effect as KeyframeEffect;
        if (
          effect.target !== grid &&
          effect.target !== surface &&
          !(effect.target === header && effect.pseudoElement === "::before")
        )
          continue;
        if (animations.includes(animation)) continue;
        animation.pause();
        animation.currentTime = 0;
        animations.push(animation);
      }
      if (animations.length === 3)
        document.removeEventListener("transitionrun", capture);
    };
    document.addEventListener("transitionrun", capture);
    return { animations };
  });
}

export async function waitForWorkspaceTransition(
  capture: Awaited<ReturnType<typeof captureWorkspaceTransition>>,
) {
  await expect
    .poll(() => capture.evaluate(({ animations }) => animations.length))
    .toBe(3);
}
