import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getRequestOrigin,
  getSiteUrlOrigin,
} from '@/lib/supabase/auth-redirect';

describe('auth redirect origin helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefers NEXT_PUBLIC_SITE_URL over request.url', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://sexyvoice.ai');

    expect(
      getRequestOrigin(
        new Request('http://localhost:3100/auth/signup', {
          headers: { origin: 'https://evil.example' },
        }),
      ),
    ).toBe('https://sexyvoice.ai');
  });

  it('falls back to request.url when NEXT_PUBLIC_SITE_URL is unset', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;

    expect(
      getRequestOrigin(
        new Request('http://localhost:3100/auth/signup', {
          headers: { origin: 'https://evil.example' },
        }),
      ),
    ).toBe('http://localhost:3100');
  });

  it('returns null for invalid NEXT_PUBLIC_SITE_URL values', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'not-a-url');

    expect(getSiteUrlOrigin()).toBeNull();
    expect(
      getRequestOrigin(new Request('http://localhost:3100/auth/signup')),
    ).toBe('http://localhost:3100');
  });

  it('returns null when no trusted origin can be resolved', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;

    expect(getRequestOrigin({ url: 'not-a-url' } as Request)).toBeNull();
  });
});
