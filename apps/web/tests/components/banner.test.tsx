// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Banner } from '@/components/banner';
import type { ResolvedBanner } from '@/lib/banners/types';
import { setCookie } from '@/lib/cookies';

const DISMISS_COOKIE = 'banner-expressive-voices-launch-dismissed';
const banner = {
  ariaLabelDismiss: 'Dismiss expressive voices announcement',
  ctaLink: '/en/dashboard/generate',
  ctaText: 'Try voices',
  dismiss: {
    cookieKey: DISMISS_COOKIE,
    days: 14,
  },
  dismissible: true,
  id: 'expressiveVoicesLaunch',
  kind: 'announcement',
  text: 'Generate with new expressive voices.',
  theme: 'blue',
} satisfies ResolvedBanner;

function clearDismissCookie() {
  return setCookie(DISMISS_COOKIE, '', {
    expires: new Date(0),
    path: '/',
  });
}

describe('Banner', () => {
  beforeEach(clearDismissCookie);

  afterEach(async () => {
    cleanup();
    await clearDismissCookie();
    vi.unstubAllGlobals();
  });

  it('centers the dashboard message and CTA without a fixed overlay', async () => {
    const { container } = render(<Banner banner={banner} inDashboard />);
    const cta = await screen.findByRole('link', { name: banner.ctaText });
    const surface = container.querySelector('[data-promo-theme]');
    const layout = surface?.firstElementChild;

    expect(surface).toHaveAttribute('data-promo-theme', 'blue');
    expect(surface).not.toHaveClass('fixed', 'backdrop-blur-sm');
    expect(layout).toHaveClass('justify-center', 'sm:flex-wrap', 'px-14');
    expect(layout).not.toHaveClass('sm:grid');
    expect(cta).toHaveAttribute('href', banner.ctaLink);
    expect(cta).toHaveClass('min-h-10');
    expect(
      screen.getByRole('button', { name: banner.ariaLabelDismiss }),
    ).toHaveClass('absolute', 'right-2', 'size-11');
  });

  it('preserves the public banner grid and inline dismiss button', async () => {
    const { container } = render(<Banner banner={banner} />);
    const dismiss = await screen.findByRole('button', {
      name: banner.ariaLabelDismiss,
    });
    const layout =
      container.querySelector('[data-promo-theme]')?.firstElementChild;

    expect(layout).toHaveClass('sm:grid', 'sm:grid-cols-[1fr_auto]');
    expect(dismiss).not.toHaveClass('absolute');
  });

  it.each([true, false])(
    'uses themed dismiss interactions (dashboard: %s)',
    async (inDashboard) => {
      render(<Banner banner={banner} inDashboard={inDashboard} />);
      const dismiss = await screen.findByRole('button', {
        name: banner.ariaLabelDismiss,
      });

      expect(dismiss).toHaveClass(
        'text-white',
        'hover:bg-promo-accent/20',
        'hover:text-white',
        'focus-visible:ring-promo-accent',
      );
      expect(dismiss).not.toHaveClass(
        'hover:bg-accent',
        'hover:text-accent-foreground',
      );
    },
  );

  it('renders a non-dismissible dashboard banner without a close button', async () => {
    render(<Banner banner={{ ...banner, dismissible: false }} inDashboard />);

    expect(
      await screen.findByRole('link', { name: banner.ctaText }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: banner.ariaLabelDismiss }),
    ).not.toBeInTheDocument();
  });

  it('stores dismissal locally without making a request', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    render(<Banner banner={banner} inDashboard />);

    const dismissButton = await screen.findByRole('button', {
      name: banner.ariaLabelDismiss,
    });

    await user.click(dismissButton);

    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: banner.ariaLabelDismiss }),
      ).not.toBeInTheDocument();
    });
    expect(document.cookie).toContain(`${DISMISS_COOKIE}=true`);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
