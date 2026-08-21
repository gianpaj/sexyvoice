// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { setCookie } from '@/lib/cookies';

afterEach(() => {
  Reflect.deleteProperty(window, 'cookieStore');
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
