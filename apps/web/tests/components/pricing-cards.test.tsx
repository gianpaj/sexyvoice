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
import spanishMessages from '@/messages/es.json';

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

describe('pricing bonus presentation', () => {
  afterEach(cleanup);

  it.each([
    { locale: 'en' as const, translations: messages },
    { locale: 'es' as const, translations: spanishMessages },
  ])(
    'uses the same translated promo label and theme in both modes ($locale)',
    async ({ locale, translations }) => {
      const user = userEvent.setup();
      const { container } = render(
        <NextIntlClientProvider locale={locale} messages={translations}>
          <PricingCards
            isPromoEnabled
            promoTheme="orange"
            subscriptionPlans={[
              { ...plan, subscriptionBonusCredits: '12,375' },
            ]}
            topupPlans={[{ ...plan, promoBonus: '7,500' }]}
          />
        </NextIntlClientProvider>,
      );
      const bonusLabel = translations.credits.plans.subscriptionBonusCredits;
      const monthlyBonus = screen.getByText(
        bonusLabel.replace('{bonusCredits}', '12,375'),
      );
      expect(monthlyBonus).toHaveClass('text-promo-text-dark');
      expect(monthlyBonus).not.toHaveClass('text-green-400');
      expect(container.firstChild).toHaveAttribute(
        'data-promo-theme',
        'orange',
      );

      await user.click(
        screen.getByRole('button', {
          name: translations.credits.plans.toggleOneTime,
        }),
      );

      expect(
        screen.getByText(bonusLabel.replace('{bonusCredits}', '7,500')),
      ).toHaveClass('text-promo-text-dark');
      expect(
        screen.queryByText(bonusLabel.replace('{bonusCredits}', '12,375')),
      ).not.toBeInTheDocument();
    },
  );

  it('keeps the monthly bonus green and hides one-time bonuses when the promo is disabled', async () => {
    const user = userEvent.setup();
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PricingCards
          isPromoEnabled={false}
          promoTheme="orange"
          subscriptionPlans={[{ ...plan, subscriptionBonusCredits: '3,750' }]}
          topupPlans={[{ ...plan, promoBonus: '7,500' }]}
        />
      </NextIntlClientProvider>,
    );
    const bonusLabel = messages.credits.plans.subscriptionBonusCredits;
    const monthlyBonus = screen.getByText(
      bonusLabel.replace('{bonusCredits}', '3,750'),
    );
    expect(monthlyBonus).toHaveClass('text-green-400');
    expect(monthlyBonus).not.toHaveClass('text-promo-text-dark');

    await user.click(
      screen.getByRole('button', {
        name: messages.credits.plans.toggleOneTime,
      }),
    );

    expect(
      screen.queryByText(bonusLabel.replace('{bonusCredits}', '7,500')),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(bonusLabel.replace('{bonusCredits}', '3,750')),
    ).not.toBeInTheDocument();
  });
});

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
