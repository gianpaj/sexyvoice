// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getCookie, setCookie } from '@/lib/cookies';

afterEach(() => {
  Reflect.deleteProperty(window, 'cookieStore');
});

describe('getCookie', () => {
  it('reads a cookie when another cookie is malformed', async () => {
    // biome-ignore lint/suspicious/noDocumentCookie: Exercises the document.cookie fallback.
    document.cookie = 'broken=%E0%A4%A';
    // biome-ignore lint/suspicious/noDocumentCookie: Exercises the document.cookie fallback.
    document.cookie = 'banner-dismissed=true';

    await expect(getCookie('banner-dismissed')).resolves.toBe('true');
    await expect(getCookie('broken')).resolves.toBe('%E0%A4%A');
  });
});

describe('setCookie', () => {
  it('uses Lax SameSite with the Cookie Store API', async () => {
    const cookieStoreSet = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, 'cookieStore', {
      configurable: true,
      value: { set: cookieStoreSet },
    });
    const expires = new Date('2026-09-03T12:00:00.000Z');

    await setCookie('banner-dismissed', 'true', {
      expires,
      path: '/',
    });

    expect(cookieStoreSet).toHaveBeenCalledWith({
      expires: expires.getTime(),
      name: 'banner-dismissed',
      path: '/',
      sameSite: 'lax',
      value: 'true',
    });
  });
});
