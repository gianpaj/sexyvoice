// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CreditsFaq } from '@/components/credits-faq';
import { CREDITS_PER_MINUTE } from '@/lib/supabase/constants';
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
        const expectedAnswer = faq.answer.replaceAll(
          '{count}',
          String(CREDITS_PER_MINUTE),
        );
        expect(screen.getByText(expectedAnswer)).toBeVisible();
      }
    },
  );
});
