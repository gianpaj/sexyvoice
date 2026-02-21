import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Page Object Model for Profile Dashboard
 *
 * Encapsulates interactions with the profile/settings page.
 * The page contains:
 * - Security card: email display, password change form
 * - Danger Zone card: account deletion with confirmation dialog
 *
 * Usage:
 *   const profilePage = new ProfilePage(page);
 *   await profilePage.goto();
 *   await profilePage.expectSecurityCardVisible();
 */
export class ProfilePage {
  readonly page: Page;

  // Security card elements
  readonly securityCard: Locator;
  readonly securityTitle: Locator;
  readonly emailInput: Locator;
  readonly currentPasswordInput: Locator;
  readonly newPasswordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly updatePasswordButton: Locator;

  // Danger zone elements
  readonly dangerZoneCard: Locator;
  readonly dangerZoneTitle: Locator;
  readonly dangerZoneAlert: Locator;
  readonly deleteAccountButton: Locator;

  // Delete confirmation dialog elements
  readonly confirmationDialog: Locator;
  readonly confirmationDialogTitle: Locator;
  readonly confirmationDialogDescription: Locator;
  readonly confirmationCancelButton: Locator;
  readonly confirmationContinueButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Security card
    this.securityCard = page
      .locator('div')
      .filter({ hasText: /Security/i })
      .first();
    this.securityTitle = page.getByRole('heading', { name: /security/i });
    this.emailInput = page.getByRole('textbox', { name: /email/i });
    this.currentPasswordInput = page.getByLabel(/current password/i);
    this.newPasswordInput = page.getByLabel(/^new password$/i);
    this.confirmPasswordInput = page.getByLabel(/confirm new password/i);
    this.updatePasswordButton = page.getByRole('button', {
      name: /update password/i,
    });

    // Danger zone
    this.dangerZoneTitle = page.getByRole('heading', { name: /danger zone/i });
    this.dangerZoneCard = page
      .locator('div')
      .filter({ has: this.dangerZoneTitle })
      .first();
    this.dangerZoneAlert = page
      .getByText(/permanently delete/i)
      .or(page.getByText(/cannot be undone/i))
      .or(page.getByText(/will be permanently/i))
      .first();
    this.deleteAccountButton = page.getByRole('button', {
      name: /delete account/i,
    });

    // Confirmation dialog (appears when delete account is clicked)
    this.confirmationDialog = page.getByRole('alertdialog');
    this.confirmationDialogTitle = this.confirmationDialog
      .getByRole('heading')
      .first();
    this.confirmationDialogDescription = this.confirmationDialog
      .locator('p')
      .first();
    this.confirmationCancelButton = this.confirmationDialog.getByRole(
      'button',
      { name: /cancel/i },
    );
    this.confirmationContinueButton = this.confirmationDialog.getByRole(
      'button',
      { name: /continue|confirm|delete/i },
    );
  }

  /**
   * Navigate to the profile page
   */
  async goto() {
    await this.page.goto('/en/dashboard/profile', {
      waitUntil: 'domcontentloaded',
    });
    // Wait for the security section to load
    await this.securityTitle.waitFor({ state: 'visible', timeout: 15_000 });
  }

  // --- Actions ---

  /**
   * Fill in the password change form
   */
  async fillPasswordForm(
    currentPassword: string,
    newPassword: string,
    confirmPassword: string,
  ) {
    await this.currentPasswordInput.fill(currentPassword);
    await this.newPasswordInput.fill(newPassword);
    await this.confirmPasswordInput.fill(confirmPassword);
  }

  /**
   * Submit the password change form
   */
  async submitPasswordForm() {
    await this.updatePasswordButton.click();
  }

  /**
   * Fill and submit the password change form in one step
   */
  async changePassword(
    currentPassword: string,
    newPassword: string,
    confirmPassword: string,
  ) {
    await this.fillPasswordForm(currentPassword, newPassword, confirmPassword);
    await this.submitPasswordForm();
  }

  /**
   * Click the delete account button to open the confirmation dialog
   */
  async clickDeleteAccount() {
    await this.deleteAccountButton.click();
  }

  /**
   * Cancel the delete account confirmation dialog
   */
  async cancelDeleteAccount() {
    await this.confirmationCancelButton.click();
  }

  // --- Assertions ---

  /**
   * Verify the security card is visible with its title
   */
  async expectSecurityCardVisible() {
    await expect(this.securityTitle).toBeVisible();
  }

  /**
   * Verify the email input is visible and disabled
   */
  async expectEmailDisabled() {
    await expect(this.emailInput).toBeVisible();
    await expect(this.emailInput).toBeDisabled();
  }

  /**
   * Verify the email input contains the expected email
   */
  async expectEmailValue(email: string) {
    await expect(this.emailInput).toHaveValue(email);
  }

  /**
   * Verify all password fields are visible
   */
  async expectPasswordFieldsVisible() {
    await expect(this.currentPasswordInput).toBeVisible();
    await expect(this.newPasswordInput).toBeVisible();
    await expect(this.confirmPasswordInput).toBeVisible();
  }

  /**
   * Verify the update password button is visible
   */
  async expectUpdatePasswordButtonVisible() {
    await expect(this.updatePasswordButton).toBeVisible();
  }

  /**
   * Verify the update password button shows loading state
   */
  async expectUpdatePasswordButtonLoading() {
    await expect(this.updatePasswordButton).toContainText(/updating/i, {
      timeout: 5000,
    });
  }

  /**
   * Verify the danger zone section is visible
   */
  async expectDangerZoneVisible() {
    await expect(this.dangerZoneTitle).toBeVisible();
    await expect(this.deleteAccountButton).toBeVisible();
  }

  /**
   * Verify the delete confirmation dialog is visible
   */
  async expectConfirmationDialogVisible() {
    await expect(this.confirmationDialog).toBeVisible({ timeout: 5000 });
  }

  /**
   * Verify the delete confirmation dialog is hidden
   */
  async expectConfirmationDialogHidden() {
    await expect(this.confirmationDialog).toBeHidden({ timeout: 5000 });
  }

  /**
   * Expect an error toast notification
   */
  async expectErrorToast(message?: string | RegExp) {
    const pattern = message ?? /error|failed|do not match/i;
    await expect(this.page.getByText(pattern).first()).toBeVisible({
      timeout: 10_000,
    });
  }

  /**
   * Expect a success toast notification
   */
  async expectSuccessToast(message?: string | RegExp) {
    const pattern = message ?? /success|updated/i;
    await expect(this.page.getByText(pattern).first()).toBeVisible({
      timeout: 10_000,
    });
  }
}
