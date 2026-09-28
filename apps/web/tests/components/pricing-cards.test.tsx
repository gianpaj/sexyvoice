// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCheckoutSession } from '@/app/[lang]/actions/stripe';
import { type PlanData, PricingCards } from '@/components/pricing-cards';
import messages from '@/messages/en.json';

vi.mock('@/app/[lang]/actions/stripe', () => ({
  createCheckoutSession: vi.fn(),
}));
vi.mock('@/lib/i18n/navigation', () => ({
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

const plan: PlanData = {
  buttonText: 'Subscribe',
  buttonVariant: 'default',
  creditsText: '1,000 credits',
  description: 'Starter plan',
  features: [],
  id: 'starter',
  name: 'Starter',
  price: 10,
};

describe('checkout billing errors', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it.each(['accountBillingBlocked', 'accountBillingBusy'] as const)(
    'shows the specific %s message instead of a generic Stripe error',
    async (error) => {
      vi.mocked(createCheckoutSession).mockResolvedValue({
        client_secret: null,
        error,
        url: null,
      });
      const user = userEvent.setup();
      render(
        <NextIntlClientProvider locale="en" messages={messages}>
          <PricingCards
            checkoutEnabled
            isPromoEnabled={false}
            promoTheme="default"
            subscriptionPlans={[plan]}
            topupPlans={[plan]}
          />
        </NextIntlClientProvider>,
      );

      await user.click(screen.getByRole('button', { name: 'Subscribe' }));

      expect(
        await screen.findByText(messages.credits.status[error]),
      ).toBeVisible();
      expect(
        screen.queryByText(messages.credits.status.checkoutError),
      ).not.toBeInTheDocument();
    },
  );
});
