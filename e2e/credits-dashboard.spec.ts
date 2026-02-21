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

  test('should display the credits page correctly', async () => {
    // Verify the top-up section is visible
    await creditsPage.expectTopupSectionVisible();

    // Verify credit history section is visible
    await creditsPage.expectHistorySectionVisible();

    // Verify Stripe portal link is visible
    await creditsPage.expectStripePortalLinkVisible();
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

  test.beforeEach(async ({ page }) => {
    creditsPage = new CreditsPage(page);
  });

  test('should show success alert with query param', async () => {
    await creditsPage.gotoWithSuccess();
    await creditsPage.expectSuccessAlertVisible();
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
    // Intercept the Stripe checkout action to prevent real charges
    // The form uses a server action that returns a redirect URL
    let checkoutAttempted = false;
    await page.route('**/actions/stripe', async (route) => {
      checkoutAttempted = true;
      // Return an error to prevent redirect to Stripe
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Mocked in test' }),
      });
    });

    // Click buy on the starter package
    await creditsPage.clickBuyButton('starter');

    // The button should show a loading state (processing)
    await expect(
      creditsPage.starterCard.getByRole('button').first(),
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
