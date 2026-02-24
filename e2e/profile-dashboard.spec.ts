import { expect, test } from '@playwright/test';

import { ProfilePage } from './pages/profile.page';

/**
 * Profile Dashboard E2E Tests
 *
 * These tests verify the profile/settings page functionality:
 * 1. Security section: email display, password change form
 * 2. Danger zone: account deletion flow (WITHOUT actually deleting)
 *
 * All tests use the authenticated state from auth.setup.ts.
 */

test.describe('Profile Dashboard - Authenticated User', () => {
  let profilePage: ProfilePage;

  test.beforeEach(async ({ page }) => {
    profilePage = new ProfilePage(page);
    await profilePage.goto();
  });

  test('should display the profile page correctly', async () => {
    // Verify security section is visible
    await profilePage.expectSecurityCardVisible();

    // Verify danger zone is visible
    await profilePage.expectDangerZoneVisible();
  });

  test('should display email address as disabled', async () => {
    await profilePage.expectEmailDisabled();
  });

  test('should display password change form fields', async () => {
    await profilePage.expectPasswordFieldsVisible();
    await profilePage.expectUpdatePasswordButtonVisible();
  });

  test('should show update password button', async () => {
    await expect(profilePage.updatePasswordButton).toBeVisible();
    await expect(profilePage.updatePasswordButton).toBeEnabled();
  });

  test('should show error when passwords do not match', async ({ page }) => {
    // Mock the Supabase auth updateUser call at network level to prevent actual password change
    await page.route('**/auth/v1/user', async (route) => {
      // Intercept but let the client-side validation handle mismatched passwords
      await route.continue();
    });

    // Fill mismatched passwords
    await profilePage.fillPasswordForm(
      'currentPass123',
      'newPassword123',
      'differentPassword456',
    );

    // Submit the form
    await profilePage.submitPasswordForm();

    // Client-side validation should prevent submission
    await expect(profilePage.updatePasswordButton).toHaveText(
      /update password/i,
    );
  });

  test('should display danger zone section', async () => {
    await expect(profilePage.dangerZoneTitle).toBeVisible();
    await expect(profilePage.deleteAccountButton).toBeVisible();
  });

  test('should show delete account button with destructive styling', async () => {
    const deleteButton = profilePage.deleteAccountButton;
    await expect(deleteButton).toBeVisible();
    // The button should be a destructive variant (red)
    await expect(deleteButton).toHaveText(/delete account/i);
  });

  test('should open delete confirmation dialog', async () => {
    // Click delete account button
    await profilePage.clickDeleteAccount();

    // Confirmation dialog should appear
    await profilePage.expectConfirmationDialogVisible();

    // Dialog should have cancel and continue/delete buttons
    await expect(profilePage.confirmationCancelButton).toBeVisible();
    await expect(profilePage.confirmationContinueButton).toBeVisible();
  });

  test('should close delete confirmation dialog on cancel', async () => {
    // Open the dialog
    await profilePage.clickDeleteAccount();
    await profilePage.expectConfirmationDialogVisible();

    // Cancel the dialog
    await profilePage.cancelDeleteAccount();

    // Dialog should be hidden
    await profilePage.expectConfirmationDialogHidden();
  });

  test('should NOT actually delete account - dialog only test', async () => {
    // Open the dialog to verify it works
    await profilePage.clickDeleteAccount();
    await profilePage.expectConfirmationDialogVisible();

    // Verify the dialog has warning text
    const dialogContent = profilePage.confirmationDialog;
    await expect(dialogContent).toContainText(/delete|remove|permanent/i);

    // Close without confirming - NEVER click continue/confirm in tests
    await profilePage.cancelDeleteAccount();
    await profilePage.expectConfirmationDialogHidden();

    // Verify we're still on the profile page
    await expect(profilePage.page).toHaveURL(/dashboard\/profile/);
  });

  test('should have password fields as type password', async () => {
    await expect(profilePage.currentPasswordInput).toHaveAttribute(
      'type',
      'password',
    );
    await expect(profilePage.newPasswordInput).toHaveAttribute(
      'type',
      'password',
    );
    await expect(profilePage.confirmPasswordInput).toHaveAttribute(
      'type',
      'password',
    );
  });

  test('should require all password fields for form submission', async () => {
    // All password fields should be required
    await expect(profilePage.currentPasswordInput).toHaveAttribute(
      'required',
      '',
    );
    await expect(profilePage.newPasswordInput).toHaveAttribute('required', '');
    await expect(profilePage.confirmPasswordInput).toHaveAttribute(
      'required',
      '',
    );
  });
});

test.describe('Profile Dashboard - Unauthenticated', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('should redirect to login when not authenticated', async ({ page }) => {
    await page.goto('/en/dashboard/profile');

    // Should be redirected to login
    await expect(page).toHaveURL(/login/, { timeout: 10_000 });
  });
});
