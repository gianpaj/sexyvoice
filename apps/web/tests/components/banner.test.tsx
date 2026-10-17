// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Banner } from '@/components/banner';
import type { ResolvedBanner } from '@/lib/banners/types';
import { setCookie } from '@/lib/cookies';

const DISMISS_COOKIE = 'banner-expressive-voices-launch-dismissed';
const expiredCountdown = {
  enabled: true,
  endDate: '2000-01-01T00:00:00Z',
  labels: {
    days: 'Days',
    hours: 'Hours',
    minutes: 'Min',
    prefix: 'Ends in:',
    seconds: 'Sec',
  },
};
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

  it('includes the server-resolved dashboard banner in the initial markup', () => {
    const html = renderToString(<Banner banner={banner} inDashboard />);

    expect(html).toContain('data-dashboard-banner');
    expect(html).toContain(banner.text);
  });

  it('hides a cached dashboard banner when its dismissal cookie is already set', async () => {
    await setCookie(DISMISS_COOKIE, 'true', { path: '/' });
    const { container } = render(<Banner banner={banner} inDashboard />);

    await waitFor(() => {
      expect(container.querySelector('[data-dashboard-banner]')).toBeNull();
    });
  });

  it('hydrates without a mismatch when the deadline passes after server rendering', async () => {
    const clock = vi
      .spyOn(Date, 'now')
      .mockReturnValue(Date.parse('2030-11-30T11:59:58Z'));
    const timedBanner = {
      ...banner,
      countdown: { ...expiredCountdown, endDate: '2030-11-30T12:00:00Z' },
    };
    const container = document.createElement('div');
    document.body.append(container);
    let root: ReturnType<typeof hydrateRoot> | undefined;
    const onRecoverableError = vi.fn();

    try {
      container.innerHTML = renderToString(
        <div>
          <Banner banner={timedBanner} inDashboard />
          <main />
        </div>,
      );
      expect(container.querySelector('[data-dashboard-banner]')).not.toBeNull();
      clock.mockReturnValue(Date.parse('2030-11-30T12:00:01Z'));

      await act(async () => {
        root = hydrateRoot(
          container,
          <div>
            <Banner banner={timedBanner} inDashboard />
            <main />
          </div>,
          { onRecoverableError },
        );
      });

      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(container.querySelector('[data-dashboard-banner]')).toBeNull();
    } finally {
      await act(async () => root?.unmount());
      container.remove();
      clock.mockRestore();
    }
  });

  it.each([false, true])(
    'does not reveal an expired banner after checking cookies (dashboard: %s)',
    async (inDashboard) => {
      let container: HTMLElement | undefined;
      await act(async () => {
        container = render(
          <Banner
            banner={{ ...banner, countdown: expiredCountdown }}
            inDashboard={inDashboard}
          />,
        ).container;
      });

      expect(container?.querySelector('[data-promo-theme]')).toBeNull();
    },
  );

  it('keeps public banners hidden until the client checks dismissal cookies', () => {
    expect(renderToString(<Banner banner={banner} />)).toBe('');
  });

  it('centers the dashboard message and CTA without a fixed overlay', async () => {
    const { container } = render(<Banner banner={banner} inDashboard />);
    const cta = await screen.findByRole('link', { name: banner.ctaText });
    const surface = container.querySelector('[data-promo-theme]');
    const layout = surface?.firstElementChild;

    expect(surface).toHaveAttribute('data-promo-theme', 'blue');
    expect(surface).toHaveAttribute('data-dashboard-banner');
    expect(surface).not.toHaveClass('fixed');
    expect(surface).not.toHaveClass('backdrop-blur-sm');
    expect(layout).toHaveClass(
      'justify-center',
      'sm:flex-wrap',
      'px-4',
      'gap-2',
      'pt-3',
      'pb-2',
      'sm:px-14',
    );
    expect(screen.getByText(banner.text)).toHaveClass(
      'text-sm',
      'md:text-base',
    );
    expect(screen.getByText(banner.text).parentElement).toHaveClass(
      'px-8',
      'sm:px-0',
    );
    expect(layout).not.toHaveClass('sm:grid');
    expect(cta).toHaveAttribute('href', banner.ctaLink);
    expect(cta).toHaveClass('sm:min-h-10');
    expect(cta).not.toHaveClass('min-h-10');
    const dismiss = screen.getByRole('button', {
      name: banner.ariaLabelDismiss,
    });
    expect(dismiss).toHaveClass(
      'absolute',
      'top-0',
      'right-0',
      'size-11',
      'lg:top-1/2',
      'lg:-translate-y-1/2',
    );
    expect(dismiss).not.toHaveClass('sm:top-1/2');
    expect(dismiss).not.toHaveClass('sm:-translate-y-1/2');
  });

  it('centers public desktop copy between balanced side columns and keeps mobile layout unchanged', async () => {
    const { container } = render(<Banner banner={banner} />);
    const dismiss = await screen.findByRole('button', {
      name: banner.ariaLabelDismiss,
    });
    const layout =
      container.querySelector('[data-promo-theme]')?.firstElementChild;

    expect(layout).toHaveClass(
      'sm:grid',
      'sm:grid-cols-[1fr_auto]',
      'lg:grid-cols-[1fr_2fr_1fr]',
    );
    expect(screen.getByText(banner.text).parentElement).toHaveClass(
      'lg:col-start-2',
    );
    expect(dismiss.parentElement).toHaveClass(
      'lg:col-start-3',
      'lg:justify-self-end',
    );
    expect(dismiss).not.toHaveClass('absolute');
    expect(container.querySelector('[data-dashboard-banner]')).toBeNull();
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
      expect(dismiss).not.toHaveClass('hover:bg-accent');
      expect(dismiss).not.toHaveClass('hover:text-accent-foreground');
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
    expect(document.querySelector('[data-dashboard-banner]')).toBeNull();
    expect(document.cookie).toContain(`${DISMISS_COOKIE}=true`);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
