// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
    legacyCookieKeys: [],
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
    await clearDismissCookie();
    vi.unstubAllGlobals();
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
