// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { isValidElement } from 'react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DeleteAccountForm } from '@/app/[lang]/(dashboard)/dashboard/profile/delete-account-form';
import { handleDeleteAccountAction } from '@/app/actions';
import { STRIPE_BILLING_PORTAL_URL } from '@/lib/stripe/billing-portal';
import messages from '@/messages/en.json';

vi.mock('@/app/actions', () => ({
  handleDeleteAccountAction: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

describe('DeleteAccountForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it.each([
    'subscriptionExists',
    'subscriptionCheckFailed',
    'accountBillingBlocked',
    'accountBillingBusy',
  ] as const)(
    'displays the %s error returned by the server action',
    async (error) => {
      vi.mocked(handleDeleteAccountAction).mockResolvedValue({ error });
      const user = userEvent.setup();
      render(
        <NextIntlClientProvider locale="en" messages={messages}>
          <DeleteAccountForm />
        </NextIntlClientProvider>,
      );

      await user.click(screen.getByRole('button', { name: 'Delete account' }));
      await user.click(screen.getByRole('button', { name: 'Continue' }));

      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      expect(vi.mocked(toast.error).mock.calls[0][0]).toBe(
        messages.profile.dangerZone.deleteAccount.errors[error],
      );
      expect(handleDeleteAccountAction).toHaveBeenCalledWith({ lang: 'en' });

      const options = vi.mocked(toast.error).mock.calls[0][1];
      if (error === 'subscriptionExists' || error === 'accountBillingBlocked') {
        expect(options).toMatchObject({
          closeButton: true,
          duration: Number.POSITIVE_INFINITY,
        });
      }
      if (error === 'accountBillingBlocked') {
        expect(vi.mocked(toast.error).mock.calls[0][0]).toContain(
          'dashboard chat',
        );
        expect(vi.mocked(toast.error).mock.calls[0][0]).toContain(
          'info@sexyvoice.ai',
        );
      }
      if (error === 'subscriptionExists') {
        expect(isValidElement(options?.action)).toBe(true);
        if (isValidElement(options?.action)) render(options.action);
        expect(
          screen.getByRole('link', { name: 'Manage billing' }),
        ).toHaveAttribute('href', STRIPE_BILLING_PORTAL_URL);
      } else {
        expect(options?.action).toBeUndefined();
      }
    },
  );
});
