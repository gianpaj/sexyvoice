import type { Page } from '@playwright/test';

/**
 * Wait until React has hydrated the element matching `selector`.
 *
 * `domcontentloaded` fires once the SSR HTML is parsed, so server-rendered
 * controls are visible before React attaches its event handlers. Clicks and
 * input events fired in that window are lost. React writes `__react*`
 * properties onto DOM nodes during hydration, so their presence means the
 * element's handlers are live.
 *
 * Tiptap editors mount on the client and carry no React properties, so a
 * contenteditable match also counts as hydrated.
 */
export async function waitForHydration(page: Page, selector: string) {
  await page.waitForFunction(
    (target) => {
      const el = document.querySelector(target);
      if (!el) return false;
      return (
        (el instanceof HTMLElement && el.isContentEditable) ||
        Object.keys(el).some((key) => key.startsWith('__react'))
      );
    },
    selector,
    { timeout: 15_000 },
  );
}
