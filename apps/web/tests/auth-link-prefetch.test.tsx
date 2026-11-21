// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Header } from '@/components/header';
import { HeaderStatic } from '@/components/header-static';
import messages from '@/messages/en.json';
import { config as proxyConfig } from '@/proxy';

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
  it('runs proxy on localized login and signup even when prefetch headers are set', () => {
    const matchers = proxyConfig.matcher as Array<
      | string
      | {
          missing?: Array<{ key: string; type: string; value?: string }>;
          source: string;
        }
    >;

    const authMatcher = matchers.find(
      (entry) =>
        typeof entry !== 'string' &&
        entry.source.includes('login') &&
        entry.source.includes('signup'),
    );

    expect(authMatcher).toBeDefined();
    expect(
      typeof authMatcher === 'string' ? undefined : authMatcher?.missing,
    ).toBeUndefined();

    const generalMatcher = matchers.find(
      (entry) =>
        typeof entry !== 'string' &&
        entry.missing?.some((header) => header.key === 'next-router-prefetch'),
    );

    expect(generalMatcher).toBeDefined();
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
