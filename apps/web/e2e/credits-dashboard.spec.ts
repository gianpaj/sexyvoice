import { argosScreenshot } from '@argos-ci/playwright';
import { expect, test } from '@playwright/test';

import { CreditsPage } from './pages/credits.page';

/**
 * Credits Dashboard E2E Tests
 *
 * These tests verify the credits/billing page functionality:
 * 1. Credit top-up packages (Starter, Standard, Pro)
 * 2. Stripe Customer Portal link
 * 3. Credit transaction history
 * 4. TopupStatus alerts (success/canceled/error via URL params)
 *
 * All tests use the authenticated state from auth.setup.ts.
 * Stripe checkout sessions are NOT created — we only test the UI.
 */

test.describe('Credits Dashboard - Authenticated User', () => {
  let creditsPage: CreditsPage;

  test.beforeEach(async ({ page }) => {
    creditsPage = new CreditsPage(page);
    await creditsPage.goto();
  });

  test('should display the credits page correctly', async ({
    page,
  }, testInfo) => {
    // Verify the top-up section is visible
    await creditsPage.expectTopupSectionVisible();

    // Verify credit history section is visible
    await creditsPage.expectHistorySectionVisible();

    // Verify Stripe portal link is visible
    await creditsPage.expectStripePortalLinkVisible();

    await argosScreenshot(page, `credits-dashboard-${testInfo.project.name}`);
  });

  test('should display three credit packages', async () => {
    await creditsPage.expectPackageCardsVisible();
  });

  test('should display package prices', async () => {
    await creditsPage.expectPackagePricesVisible();
  });

  test('should display credits text on each package', async () => {
    await creditsPage.expectPackageCreditsTextVisible();
  });

  test('should show buy credits buttons', async () => {
    await creditsPage.expectBuyButtonsVisible();
  });

  test('should display credit history section', async () => {
    await creditsPage.expectHistorySectionVisible();
  });

  test('should display transaction history table or empty state', async () => {
    await creditsPage.expectHistoryTableOrEmptyState();
  });

  test('should show Stripe Customer Portal link with correct href', async () => {
    await creditsPage.expectStripePortalLinkVisible();
    await creditsPage.expectStripePortalLinkOpensNewTab();
  });
});

test.describe('Credits Dashboard - TopupStatus Alerts', () => {
  let creditsPage: CreditsPage;

  test.beforeEach(({ page }) => {
    creditsPage = new CreditsPage(page);
  });

  test('should show success alert with query param', async ({
    page,
  }, testInfo) => {
    await creditsPage.gotoWithSuccess();
    await creditsPage.expectSuccessAlertVisible();
    await argosScreenshot(
      page,
      `credits-dashboard-success-alert-${testInfo.project.name}`,
    );
  });

  test('should show success alert with credits amount', async () => {
    await creditsPage.gotoWithSuccess(500);
    await creditsPage.expectSuccessAlertVisible();
    await creditsPage.expectSuccessAlertWithAmount(500);
  });

  test('should show canceled alert with query param', async () => {
    await creditsPage.gotoWithCanceled();
    await creditsPage.expectCanceledAlertVisible();
  });

  test('should show error alert with query param', async () => {
    await creditsPage.gotoWithError();
    await creditsPage.expectErrorAlertVisible();
  });

  test('should dismiss success alert', async () => {
    await creditsPage.gotoWithSuccess();
    await creditsPage.expectSuccessAlertVisible();

    // Dismiss the alert
    await creditsPage.dismissAlert();

    // Alert should be hidden after dismissal
    await creditsPage.expectAlertDismissed();
  });

  test('should not show alerts without query params', async () => {
    await creditsPage.goto();
    await creditsPage.expectNoAlertVisible();
  });
});

test.describe('Credits Dashboard - Checkout Flow', () => {
  let creditsPage: CreditsPage;

  test.beforeEach(async ({ page }) => {
    creditsPage = new CreditsPage(page);
    await creditsPage.goto();
  });

  test('should attempt checkout when clicking buy button', async ({ page }) => {
    await creditsPage.clickBuyButton('starter');

    const result = await Promise.race([
      page
        .waitForURL(/stripe|checkout/i, { timeout: 5000 })
        .then(() => 'redirect' as const)
        .catch(() => null),
      creditsPage
        .expectCheckoutErrorVisible()
        .then(() => 'error' as const)
        .catch(() => null),
    ]);

    expect(result).toBeTruthy();

    await expect(
      creditsPage.starterCard.getByRole('button', {
        name: /buy credits|processing/i,
      }),
    ).toBeVisible();
  });
});

test.describe('Credits Dashboard - Unauthenticated', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('should redirect to login when not authenticated', async ({ page }) => {
    await page.goto('/en/dashboard/credits');

    // Should be redirected to login
    await expect(page).toHaveURL(/login/, { timeout: 10_000 });
  });
});
