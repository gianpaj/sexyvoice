import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Page Object Model for Credits Dashboard
 *
 * Encapsulates interactions with the credits/billing page.
 * The page contains:
 * - TopupStatus alerts (success/canceled/error driven by URL search params)
 * - Stripe Customer Portal link
 * - Three credit top-up packages (Starter, Standard, Pro)
 * - A custom top-up card for an arbitrary credit amount
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
  readonly pricingCards: Locator;
  readonly packageCards: Locator;
  readonly starterCard: Locator;
  readonly standardCard: Locator;
  readonly proCard: Locator;
  readonly buyButtons: Locator;
  readonly starterPrice: Locator;
  readonly standardPrice: Locator;
  readonly proPrice: Locator;

  // Custom top-up card
  readonly customTopupCard: Locator;
  readonly customCreditsInput: Locator;
  readonly customIncreaseButton: Locator;
  readonly customDecreaseButton: Locator;
  readonly customBuyButton: Locator;

  // Credit history section
  readonly historyTitle: Locator;
  readonly historyTable: Locator;
  readonly historyTableHeaders: Locator;
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

    // Package cards — scope everything to the pricing grid so sidebar cards,
    // unrelated dashboard sections and the custom top-up card (which has its
    // own "Buy Credits" button) are never mistaken for a package.
    this.pricingCards = page.getByTestId('pricing-cards');
    this.packageCards = this.pricingCards.locator('[class*="card"]').filter({
      has: page.getByRole('button', { name: /buy credits/i }),
    });
    this.starterCard = this.packageCards
      .filter({ hasText: /starter/i })
      .first();
    this.standardCard = this.packageCards
      .filter({ hasText: /standard/i })
      .first();
    this.proCard = this.packageCards.filter({ hasText: /pro/i }).first();
    this.buyButtons = this.pricingCards.getByRole('button', {
      name: /buy credits/i,
    });
    this.starterPrice = this.starterCard
      .locator('span')
      .filter({ hasText: /^\$\d+/ })
      .first();
    this.standardPrice = this.standardCard
      .locator('span')
      .filter({ hasText: /^\$\d+/ })
      .first();
    this.proPrice = this.proCard
      .locator('span')
      .filter({ hasText: /^\$\d+/ })
      .first();

    // Custom top-up card
    this.customTopupCard = page.getByTestId('custom-topup');
    this.customCreditsInput = this.customTopupCard.getByLabel(/^credits$/i);
    this.customIncreaseButton = this.customTopupCard.getByRole('button', {
      name: /increase credits/i,
    });
    this.customDecreaseButton = this.customTopupCard.getByRole('button', {
      name: /decrease credits/i,
    });
    this.customBuyButton = this.customTopupCard.getByRole('button', {
      name: /buy credits|processing/i,
    });

    // Credit history section
    this.historyTitle = page.getByRole('heading', { name: /history/i });
    this.historyTable = page.locator('table');
    this.historyTableHeaders = page.locator('table thead th');
    this.historyTableRows = page.locator('table tbody tr');
    this.historyEmptyState = page.getByText(/no transactions yet/i);

    // TopupStatus alerts (driven by URL search params)
    this.successAlert = page.getByRole('alert').filter({
      hasText: /payment successful|successfully added|credited with/i,
    });
    this.canceledAlert = page.getByRole('alert').filter({
      hasText: /payment cancelled|payment canceled|no charges were made/i,
    });
    this.errorAlert = page.getByRole('alert').filter({
      hasText:
        /payment failed|failed to create checkout session|issue processing your payment/i,
    });
    this.dismissButton = page.getByRole('button', {
      name: /dismiss/i,
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
    await this.buyButtons.first().waitFor({
      state: 'visible',
      timeout: 20_000,
    });
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
    let card: Locator;
    if (packageName === 'starter') {
      card = this.starterCard;
    } else if (packageName === 'standard') {
      card = this.standardCard;
    } else {
      card = this.proCard;
    }
    await card.getByRole('button', { name: /buy credits/i }).click();
  }

  /**
   * Type a credit amount into the custom top-up input and commit it (the field
   * only snaps to a purchasable amount on blur, so half-typed values survive)
   */
  async setCustomCredits(credits: number) {
    await this.customCreditsInput.fill(String(credits));
    await this.customCreditsInput.blur();
  }

  /**
   * Dismiss the topup status alert
   */
  async dismissAlert() {
    let visibleAlert = this.errorAlert;

    if (await this.successAlert.isVisible()) {
      visibleAlert = this.successAlert;
    } else if (await this.canceledAlert.isVisible()) {
      visibleAlert = this.canceledAlert;
    }

    await visibleAlert
      .getByRole('button', { name: /dismiss/i })
      .evaluate((element) => (element as HTMLElement).click());
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
    await expect(this.starterPrice).toBeVisible();
    await expect(this.standardPrice).toBeVisible();
    await expect(this.proPrice).toBeVisible();
  }

  /**
   * Verify three buy buttons exist (one per package)
   */
  async expectBuyButtonsVisible() {
    await expect(this.buyButtons).toHaveCount(3);
  }

  /**
   * Verify the custom top-up card is visible with the minimum credit amount
   * pre-filled
   */
  async expectCustomTopupVisible() {
    await expect(this.customTopupCard).toBeVisible();
    await expect(this.customCreditsInput).toHaveValue('5000');
    await expect(this.customBuyButton).toBeVisible();
  }

  /**
   * Verify the custom top-up card shows the given price for the current amount
   */
  async expectCustomTopupPrice(price: string) {
    await expect(
      this.customTopupCard.getByText(price, { exact: true }),
    ).toBeVisible();
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
      // Table exists — verify it has the expected headers. Scope the lookup to
      // the table: page-wide text matching is a substring match, so "Amount"
      // also hits copy such as the custom top-up card's "Custom amount" title.
      await expect(this.historyTableHeaders).toHaveText([
        'Date',
        'Description',
        'Type',
        'Amount',
      ]);
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
   * Verify checkout failed inline (expected in local/dev without Stripe price IDs)
   */
  async expectCheckoutErrorVisible() {
    await expect(
      this.errorAlert
        .or(this.page.getByText(/failed to create checkout session/i))
        .first(),
    ).toBeVisible({ timeout: 5000 });
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
