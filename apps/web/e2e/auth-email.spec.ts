import { expect, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Email auth links', () => {
  test('email signup sends a final destination instead of /auth/callback', async ({
    page,
  }) => {
    const email = `auth-email-${Date.now()}@example.test`;

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
    expect(signupResponse.status()).toBe(201);
    const signupBody = JSON.parse(signupResponse.request().postData() ?? '{}');
    const signupPayload = (await signupResponse.json()) as {
      data?: { emailRedirectTo?: string };
    };

    expect(signupPayload.data?.emailRedirectTo).toBe(
      `${appOrigin}/en/dashboard`,
    );
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

  test('confirmation links require email and browser consent before verification', async ({
    page,
  }) => {
    await page.goto(
      '/auth/confirm?token_hash=fixture-token&type=email&lang=en',
    );
    await expect(page).toHaveURL(/\/auth\/confirm$/);
    await expect(
      page.getByRole('heading', { name: 'Confirm your email link' }),
    ).toBeVisible();
    await expect(
      page.getByLabel('Email address', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel('Use this address and switch accounts if needed.'),
    ).not.toBeChecked();
    await expect(page.locator('form')).toHaveAttribute('method', 'post');
    await expect(page.locator('input[name="csrf"]')).toHaveValue(
      /^[A-Za-z0-9_-]{43}$/,
    );
    expect(await page.content()).not.toContain('fixture-token');

    await page
      .getByLabel('Email address', { exact: true })
      .fill('fixture@example.test');
    await page
      .getByLabel('Use this address and switch accounts if needed.')
      .check();
    await page
      .locator('input[name="csrf"]')
      .evaluate((input: HTMLInputElement) => {
        input.value = 'wrong';
      });
    const before = await page.context().cookies();
    const submitted = page.waitForResponse(
      (response) =>
        response.url().endsWith('/auth/confirm') &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Confirm and continue' }).click();
    const response = await submitted;
    expect(response.request().headers().origin).toBe(
      new URL(page.url()).origin,
    );
    expect(response.status()).toBe(403);
    expect(await page.context().cookies()).toEqual(before);
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
