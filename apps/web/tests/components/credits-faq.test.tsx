// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CreditsFaq } from '@/components/credits-faq';
import { faqAnswerText } from '@/lib/faq';
import english from '@/messages/en.json';
import spanish from '@/messages/es.json';

vi.mock('next-intl/server', () => ({
  getMessages: async ({ locale }: { locale: string }) =>
    locale === 'es' ? spanish : english,
}));

afterEach(cleanup);

describe('CreditsFaq', () => {
  it.each([
    { lang: 'en' as const, messages: english },
    { lang: 'es' as const, messages: spanish },
  ])(
    'shares the landing billing answers in $lang',
    async ({ lang, messages }) => {
      const user = userEvent.setup();
      const group = messages.landing.faq.groups.find(
        (item) => item.id === 'pricingAndAccess',
      )!;
      render(await CreditsFaq({ lang }));

      expect(
        screen.getByRole('heading', { name: group.category }),
      ).toBeVisible();
      for (const faq of group.questions) {
        await user.click(screen.getByRole('button', { name: faq.question }));
        expect(screen.getByText(faqAnswerText(faq.answer))).toBeVisible();
      }
    },
  );
});
