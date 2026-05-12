import { expect, type Route, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

const corsHeaders = (origin: string) => ({
  'access-control-allow-headers':
    'authorization, apikey, content-type, x-client-info, x-supabase-api-version',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-origin': origin,
});

const mockSignupUser = (email: string) => {
  const now = new Date().toISOString();

  return {
    id: '11111111-1111-4111-8111-111111111111',
    aud: 'authenticated',
    role: 'authenticated',
    email,
    phone: '',
    app_metadata: {
      provider: 'email',
      providers: ['email'],
    },
    user_metadata: {},
    identities: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        user_id: '11111111-1111-4111-8111-111111111111',
        identity_id: '22222222-2222-4222-8222-222222222222',
        provider: 'email',
        email,
        identity_data: {
          email,
          email_verified: false,
          phone_verified: false,
          sub: '11111111-1111-4111-8111-111111111111',
        },
        last_sign_in_at: now,
        created_at: now,
        updated_at: now,
      },
    ],
    created_at: now,
    updated_at: now,
  };
};

test.describe('Email auth links', () => {
  test.afterEach(async ({ page }) => {
    await page.unroute('**/*');
  });

  test('email signup sends a final destination instead of /auth/callback', async ({
    page,
  }) => {
    const email = `auth-email-${Date.now()}@example.com`;
    let signupRedirectTo: string | null = null;
    let signupBody: Record<string, unknown> | null = null;

    await page.route('**/auth/v1/signup**', async (route: Route) => {
      const request = route.request();
      const origin = new URL(page.url()).origin;

      if (request.method() === 'OPTIONS') {
        await route.fulfill({
          status: 204,
          headers: corsHeaders(origin),
        });
        return;
      }

      const requestUrl = new URL(request.url());
      signupRedirectTo = requestUrl.searchParams.get('redirect_to');
      signupBody = request.postDataJSON();

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: corsHeaders(origin),
        body: JSON.stringify(mockSignupUser(email)),
      });
    });

    await page.goto('/en/signup');
    const appOrigin = new URL(page.url()).origin;

    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password').fill('Playwright-password-123');
    await page.getByRole('button', { name: 'Sign up', exact: true }).click();

    await expect.poll(() => signupRedirectTo).toBe(`${appOrigin}/en/dashboard`);
    expect(signupRedirectTo).not.toContain('/auth/callback');
    expect(signupBody).toMatchObject({
      email,
      password: 'Playwright-password-123',
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
