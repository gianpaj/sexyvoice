// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DeleteAccountForm } from '@/app/[lang]/(dashboard)/dashboard/profile/delete-account-form';
import { handleDeleteAccountAction } from '@/app/actions';
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

  it.each(['subscriptionExists', 'subscriptionCheckFailed'] as const)(
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

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          messages.profile.dangerZone.deleteAccount.errors[error],
        ),
      );
      expect(handleDeleteAccountAction).toHaveBeenCalledWith({ lang: 'en' });
    },
  );
});
