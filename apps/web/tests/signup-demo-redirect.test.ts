import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/auth/signup/route';

const { signUp } = vi.hoisted(() => ({ signUp: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { signUp } }),
}));

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://example.com');
  signUp.mockReset();
  signUp.mockResolvedValue({ data: { user: { id: 'user' } }, error: null });
});

afterEach(() => vi.unstubAllEnvs());

describe('signup demo continuation', () => {
  it('includes the selected take in the email confirmation callback', async () => {
    const response = await POST(
      new Request('https://example.com/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          email: 'voice@gmail.com',
          password: 'password123',
          redirectTo: '/de/dashboard/clone?demo=heike&take=calmSlow',
        }),
      }),
    );
    expect(response.status).toBe(201);
    const callback = new URL(signUp.mock.calls[0][0].options.emailRedirectTo);
    expect(callback.pathname).toBe('/auth/callback');
    expect(callback.searchParams.get('redirect_to')).toBe(
      '/de/dashboard/clone?demo=heike&take=calmSlow',
    );
  });

  it.each([
    undefined,
    'https://evil.com',
    '//evil.com',
    '/en/dashboard/clone?demo=bad&take=natural',
    '/en/dashboard/clone?demo=kat&take=natural#evil',
  ])(
    'uses the default callback for unsupported redirects: %s',
    async (redirectTo) => {
      const response = await POST(
        new Request('https://example.com/auth/signup', {
          method: 'POST',
          body: JSON.stringify({
            email: 'voice@gmail.com',
            password: 'password123',
            redirectTo,
          }),
        }),
      );
      expect(response.status).toBe(201);
      expect(signUp.mock.calls[0][0].options.emailRedirectTo).toBe(
        `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
      );
    },
  );
});
