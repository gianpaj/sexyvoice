import { expect, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Email auth links', () => {
  test('email signup sends a final destination instead of /auth/callback', async ({
    page,
  }) => {
    const email = `auth-email-${Date.now()}@example.com`;

    await page.goto('/en/signup');
    const appOrigin = new URL(page.url()).origin;

    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password').fill('Playwright-password-123');

    const signupResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/auth/signup') &&
        response.request().method() === 'POST',
    );

    await page.getByRole('button', { name: 'Sign up', exact: true }).click();

    const signupResponse = await signupResponsePromise;
    const signupBody = JSON.parse(signupResponse.request().postData() ?? '{}');
    const signupPayload = (await signupResponse.json()) as {
      data?: { emailRedirectTo?: string };
    };

    expect(signupPayload.data?.emailRedirectTo).toBe(`${appOrigin}/en/dashboard`);
    expect(signupPayload.data?.emailRedirectTo).not.toContain('/auth/callback');
    expect(signupBody).toMatchObject({
      email,
      password: 'Playwright-password-123',
      lang: 'en',
    });
    await expect(
      page.getByText('Check your email inbox for verification'),
    ).toBeVisible();
  });

  test('malformed confirmation links return users to login', async ({
    page,
  }) => {
    await page.goto('/auth/confirm?type=email');

    await expect(page).toHaveURL(/\/en\/login$/);
    await expect(
      page.getByRole('heading', { name: /welcome back/i }),
    ).toBeVisible();
  });
});
