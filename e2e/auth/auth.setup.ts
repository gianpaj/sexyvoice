import { expect, test as setup } from '@playwright/test';

const authFile = '.auth/user.json';

/**
 * Authentication Setup
 *
 * This setup runs once before all tests and performs login.
 * The authentication state (cookies) is saved to .auth/user.json
 * and reused by all tests, avoiding the need to login for each test.
 *
 * Prerequisites:
 * - Test user must exist in Supabase database
 * - Credentials must be set in .env.e2e file
 */
setup('authenticate', async ({ page }) => {
  const email = process.env.PLAYWRIGHT_TEST_USER_EMAIL;
  const password = process.env.PLAYWRIGHT_TEST_USER_PASSWORD;

  if (!(email && password)) {
    throw new Error(
      'Missing test credentials. Please set PLAYWRIGHT_TEST_USER_EMAIL and PLAYWRIGHT_TEST_USER_PASSWORD in .env.e2e file',
    );
  }

  console.log('Authenticating test user...');

  // Navigate to login page
  await page.goto('/en/login');

  // Wait for the email input to be visible — more reliable than 'networkidle'
  // which can hang indefinitely with Supabase realtime, PostHog, or other
  // long-lived background connections.
  await page.getByLabel(/email/i).waitFor({ state: 'visible' });

  // Fill in credentials
  // Using getByLabel for better accessibility testing
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);

  // Submit form - use exact match to avoid matching "Sign in with Google" button
  const loginButton = page.getByRole('button', {
    name: 'Sign in',
    exact: true,
  });
  await loginButton.click();

  // Wait for redirect to dashboard
  // The login redirects to /{lang}/dashboard after successful login
  await page.waitForURL('**/dashboard/**', { timeout: 20_000 });

  // Verify we're logged in by checking we're on the dashboard
  await expect(page).toHaveURL(/dashboard\//);

  console.log('Authentication successful!');

  // Save authentication state for reuse
  await page.context().storageState({ path: authFile });

  console.log(`Auth state saved to ${authFile}`);
});
