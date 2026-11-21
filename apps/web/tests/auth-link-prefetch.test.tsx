// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { AsyncLocalStorage } from 'node:async_hooks';
import { cleanup, render } from '@testing-library/react';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Header } from '@/components/header';
import { HeaderStatic } from '@/components/header-static';
import messages from '@/messages/en.json';
import { config as proxyConfig } from '@/proxy';
import { routing } from '@/src/i18n/routing';

if (!('AsyncLocalStorage' in globalThis)) {
  Object.assign(globalThis, { AsyncLocalStorage });
}

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
}));

vi.mock('@/lib/supabase/proxy', () => ({
  updateSession: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: mocks }),
}));
vi.mock('next-intl/server', () => ({
  getMessages: async () => ({
    header: { generate: 'Generate', login: 'Log in', signup: 'Sign up' },
  }),
}));
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobileSizes: () => ({ isMobile375: false }),
}));
vi.mock('@/lib/i18n/navigation', () => ({
  Link: ({
    children,
    href,
    prefetch,
    ...rest
  }: {
    children: React.ReactNode;
    href: string | { pathname: string };
    prefetch?: boolean;
  }) => {
    const resolvedHref = typeof href === 'string' ? href : href.pathname;
    return (
      <a
        data-prefetch={prefetch === undefined ? 'default' : String(prefetch)}
        href={resolvedHref}
        {...rest}
      >
        {children}
      </a>
    );
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getClaims.mockResolvedValue({ data: null, error: null });
});

afterEach(() => {
  cleanup();
});

describe('auth route prefetch protection', () => {
  it('runs proxy on every configured locale auth route even when prefetch headers are set', () => {
    for (const locale of routing.locales) {
      for (const path of [
        `/${locale}/login`,
        `/${locale}/login/`,
        `/${locale}/signup`,
        `/${locale}/signup/`,
      ]) {
        expect(
          unstable_doesMiddlewareMatch({
            config: proxyConfig,
            headers: { 'next-router-prefetch': '1' },
            url: `https://sexyvoice.ai${path}?_rsc=test`,
          }),
          `expected proxy to match next-router-prefetch for ${path}`,
        ).toBe(true);

        expect(
          unstable_doesMiddlewareMatch({
            config: proxyConfig,
            headers: { purpose: 'prefetch' },
            url: `https://sexyvoice.ai${path}`,
          }),
          `expected proxy to match purpose=prefetch for ${path}`,
        ).toBe(true);
      }
    }

    // Non-auth dashboard prefetches still skip the proxy.
    expect(
      unstable_doesMiddlewareMatch({
        config: proxyConfig,
        headers: { 'next-router-prefetch': '1' },
        url: 'https://sexyvoice.ai/en/dashboard/history?_rsc=test',
      }),
    ).toBe(false);
    expect(
      unstable_doesMiddlewareMatch({
        config: proxyConfig,
        headers: { purpose: 'prefetch' },
        url: 'https://sexyvoice.ai/en/dashboard/history',
      }),
    ).toBe(false);

    // Normal navigations to dashboard routes still run the proxy.
    expect(
      unstable_doesMiddlewareMatch({
        config: proxyConfig,
        url: 'https://sexyvoice.ai/en/dashboard/history',
      }),
    ).toBe(true);
  });

  it('disables prefetch on all login and signup links in HeaderStatic', () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <HeaderStatic />
      </NextIntlClientProvider>,
    );

    const authLinks = [
      ...container.querySelectorAll('a[href="/login"], a[href="/signup"]'),
    ];
    expect(authLinks).toHaveLength(4);
    for (const link of authLinks) {
      expect(link).toHaveAttribute('data-prefetch', 'false');
    }
  });

  it('disables prefetch on all login and signup links in logged-out Header', async () => {
    const html = renderToStaticMarkup(await Header({ lang: 'en' }));
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;

    const authLinks = [
      ...wrapper.querySelectorAll('a[href="/login"], a[href="/signup"]'),
    ];
    expect(authLinks).toHaveLength(4);
    for (const link of authLinks) {
      expect(link).toHaveAttribute('data-prefetch', 'false');
    }
  });
});
