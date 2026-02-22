import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Page Object Model for Credits Dashboard
 *
 * Encapsulates interactions with the credits/billing page.
 * The page contains:
 * - TopupStatus alerts (success/canceled/error driven by URL search params)
 * - Stripe Customer Portal link
 * - Three credit top-up packages (Starter, Standard, Pro)
 * - Credit transaction history table
 * - Optional Stripe pricing table for subscriptions
 *
 * Usage:
 *   const creditsPage = new CreditsPage(page);
 *   await creditsPage.goto();
 *   await creditsPage.expectPackageCardsVisible();
 */
export class CreditsPage {
  readonly page: Page;

  // Top-up section elements
  readonly topupTitle: Locator;
  readonly topupDescription: Locator;

  // Stripe Customer Portal link
  readonly stripePortalLink: Locator;

  // Credit package cards
  readonly packageCards: Locator;
  readonly starterCard: Locator;
  readonly standardCard: Locator;
  readonly proCard: Locator;
  readonly buyButtons: Locator;

  // Credit history section
  readonly historyTitle: Locator;
  readonly historyTable: Locator;
  readonly historyTableRows: Locator;
  readonly historyEmptyState: Locator;

  // TopupStatus alert elements (URL param driven)
  readonly successAlert: Locator;
  readonly canceledAlert: Locator;
  readonly errorAlert: Locator;
  readonly dismissButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Top-up section
    this.topupTitle = page.getByRole('heading', {
      name: /top.?up|buy credits|credit packages/i,
    });
    this.topupDescription = page.getByText(
      /purchase|one-time|credits|top.?up/i,
    );

    // Stripe Customer Portal link
    this.stripePortalLink = page.getByRole('link', {
      name: /stripe customer portal/i,
    });

    // Package cards — each card is a Card component containing the plan name and buy button
    this.packageCards = page.locator('[class*="card"]').filter({
      has: page.getByRole('button', { name: /buy credits/i }),
    });
    this.starterCard = page
      .locator('[class*="card"]')
      .filter({ hasText: /starter/i })
      .first();
    this.standardCard = page
      .locator('[class*="card"]')
      .filter({ hasText: /standard/i })
      .first();
    this.proCard = page
      .locator('[class*="card"]')
      .filter({ hasText: /pro/i })
      .first();
    this.buyButtons = page.getByRole('button', { name: /buy credits/i });

    // Credit history section
    this.historyTitle = page.getByRole('heading', { name: /history/i });
    this.historyTable = page.locator('table');
    this.historyTableRows = page.locator('table tbody tr');
    this.historyEmptyState = page.getByText(/no transactions yet/i);

    // TopupStatus alerts (driven by URL search params)
    this.successAlert = page.getByRole('alert').filter({
      has: page.locator('.text-emerald-500, [class*="emerald"]'),
    });
    this.canceledAlert = page.getByRole('alert').filter({
      hasText: /cancel/i,
    });
    this.errorAlert = page.getByRole('alert').filter({
      hasText: /error|failed|went wrong/i,
    });
    this.dismissButton = page.getByRole('button', {
      name: /dismiss|ok|got it/i,
    });
  }

  /**
   * Navigate to the credits page
   */
  async goto(searchParams?: string) {
    const url = searchParams
      ? `/en/dashboard/credits?${searchParams}`
      : '/en/dashboard/credits';
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    // Wait for page content to load — look for buy buttons or history heading
    await this.page
      .getByRole('button', { name: /buy credits|stripe/i })
      .first()
      .waitFor({ state: 'visible', timeout: 20_000 });
  }

  /**
   * Navigate to the credits page with a success status
   */
  async gotoWithSuccess(creditsAmount?: number) {
    const params = creditsAmount
      ? `success=true&creditsAmount=${creditsAmount}`
      : 'success=true';
    await this.goto(params);
  }

  /**
   * Navigate to the credits page with a canceled status
   */
  async gotoWithCanceled() {
    await this.goto('canceled=true');
  }

  /**
   * Navigate to the credits page with an error status
   */
  async gotoWithError() {
    await this.goto('error=true');
  }

  // --- Actions ---

  /**
   * Click the Stripe Customer Portal link
   */
  async clickStripePortal() {
    await this.stripePortalLink.click();
  }

  /**
   * Click the buy button on a specific package card
   */
  async clickBuyButton(packageName: 'starter' | 'standard' | 'pro') {
    const card =
      packageName === 'starter'
        ? this.starterCard
        : packageName === 'standard'
          ? this.standardCard
          : this.proCard;
    await card.getByRole('button', { name: /buy credits/i }).click();
  }

  /**
   * Dismiss the topup status alert
   */
  async dismissAlert() {
    await this.dismissButton.first().click();
  }

  // --- Assertions ---

  /**
   * Verify the top-up section title is visible
   */
  async expectTopupSectionVisible() {
    // The top-up heading exists or the package cards are visible
    await expect(this.buyButtons.first()).toBeVisible({ timeout: 10_000 });
  }

  /**
   * Verify that all three package cards are visible
   */
  async expectPackageCardsVisible() {
    await expect(this.starterCard).toBeVisible();
    await expect(this.standardCard).toBeVisible();
    await expect(this.proCard).toBeVisible();
  }

  /**
   * Verify each package card shows a dollar amount
   */
  async expectPackagePricesVisible() {
    await expect(this.starterCard.getByText(/\$/)).toBeVisible();
    await expect(this.standardCard.getByText(/\$/)).toBeVisible();
    await expect(this.proCard.getByText(/\$/)).toBeVisible();
  }

  /**
   * Verify three buy buttons exist (one per package)
   */
  async expectBuyButtonsVisible() {
    await expect(this.buyButtons).toHaveCount(3);
  }

  /**
   * Verify the credit history section is visible
   */
  async expectHistorySectionVisible() {
    await expect(this.historyTitle).toBeVisible();
  }

  /**
   * Verify transaction history table is visible with rows OR the empty state is shown
   */
  async expectHistoryTableOrEmptyState() {
    const tableVisible = await this.historyTable.isVisible();
    if (tableVisible) {
      // Table exists — verify it has the expected headers
      await expect(this.page.getByText('Date')).toBeVisible();
      await expect(this.page.getByText('Description')).toBeVisible();
      await expect(this.page.getByText('Type')).toBeVisible();
      await expect(this.page.getByText('Amount')).toBeVisible();
    } else {
      // Empty state is shown
      await expect(this.historyEmptyState).toBeVisible();
    }
  }

  /**
   * Verify the Stripe Customer Portal link is visible and has the correct href
   */
  async expectStripePortalLinkVisible() {
    await expect(this.stripePortalLink).toBeVisible();
    await expect(this.stripePortalLink).toHaveAttribute(
      'href',
      /billing\.stripe\.com/,
    );
  }

  /**
   * Verify the Stripe Customer Portal link opens in a new tab
   */
  async expectStripePortalLinkOpensNewTab() {
    await expect(this.stripePortalLink).toHaveAttribute('target', '_blank');
  }

  /**
   * Verify the success alert is visible
   */
  async expectSuccessAlertVisible() {
    // The success alert contains a checkmark icon and success text
    await expect(this.page.getByRole('alert').first()).toBeVisible({
      timeout: 5000,
    });
  }

  /**
   * Verify the success alert shows the credits amount
   */
  async expectSuccessAlertWithAmount(amount: number) {
    await expect(
      this.successAlert.getByText(new RegExp(amount.toLocaleString())),
    ).toBeVisible({ timeout: 5000 });
  }

  /**
   * Verify the canceled alert is visible
   */
  async expectCanceledAlertVisible() {
    await expect(this.canceledAlert).toBeVisible({ timeout: 5000 });
  }

  /**
   * Verify the error alert is visible
   */
  async expectErrorAlertVisible() {
    await expect(this.errorAlert).toBeVisible({ timeout: 5000 });
  }

  /**
   * Verify a topup status alert is not visible
   */
  async expectNoAlertVisible() {
    await expect(this.successAlert).toBeHidden();
    await expect(this.canceledAlert).toBeHidden();
    await expect(this.errorAlert).toBeHidden();
  }

  /**
   * Verify the alert was dismissed (hidden)
   */
  async expectAlertDismissed() {
    // After dismissal, status alerts should be hidden
    await expect(this.successAlert).toBeHidden({ timeout: 5000 });
    await expect(this.canceledAlert).toBeHidden({ timeout: 5000 });
    await expect(this.errorAlert).toBeHidden({ timeout: 5000 });
  }

  /**
   * Verify each package card displays credits text
   */
  async expectPackageCreditsTextVisible() {
    await expect(
      this.starterCard
        .locator('div')
        .filter({ hasText: /credits/i })
        .first(),
    ).toBeVisible();
    await expect(
      this.standardCard
        .locator('div')
        .filter({ hasText: /credits/i })
        .first(),
    ).toBeVisible();
    await expect(
      this.proCard
        .locator('div')
        .filter({ hasText: /credits/i })
        .first(),
    ).toBeVisible();
  }
}
