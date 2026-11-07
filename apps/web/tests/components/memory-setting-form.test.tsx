// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MemorySettingForm } from '@/app/[lang]/(dashboard)/dashboard/profile/memory-setting-form';
import messages from '@/messages/en.json';

const { updateUser } = vi.hoisted(() => ({ updateUser: vi.fn() }));

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ auth: { updateUser } }),
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function renderSetting(enabled: boolean) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MemorySettingForm initialEnabled={enabled} />
    </NextIntlClientProvider>,
  );
}

describe('Profile memory setting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateUser.mockResolvedValue({ error: null });
  });
  afterEach(cleanup);

  it.each([true, false])(
    'saves the account preference when starting at %s',
    async (enabled) => {
      const user = userEvent.setup();
      renderSetting(enabled);
      const toggle = screen.getByRole('switch', {
        name: messages.profile.memory.settingLabel,
      });
      expect(toggle).toHaveAttribute('aria-checked', String(enabled));

      await user.click(toggle);

      await waitFor(() =>
        expect(toggle).toHaveAttribute('aria-checked', String(!enabled)),
      );
      expect(updateUser).toHaveBeenCalledExactlyOnceWith({
        data: { call_memory_enabled: !enabled },
      });
      expect(toast.success).toHaveBeenCalledWith(
        messages.profile.memory.settingSaved,
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    },
  );

  it.each(['response', 'network'])(
    'keeps the saved value after a %s error',
    async (failure) => {
      if (failure === 'response')
        updateUser.mockResolvedValue({ error: { message: 'Save failed' } });
      else updateUser.mockRejectedValue(new Error('Offline'));
      const user = userEvent.setup();
      renderSetting(true);
      const toggle = screen.getByRole('switch');

      await user.click(toggle);

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          messages.profile.memory.settingError,
        ),
      );
      expect(toggle).toHaveAttribute('aria-checked', 'true');
      expect(toggle).toBeEnabled();
    },
  );

  it('disables the switch until the account update finishes', async () => {
    let finish!: (result: { error: null }) => void;
    updateUser.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const user = userEvent.setup();
    renderSetting(true);

    await user.click(screen.getByRole('switch'));
    expect(screen.getByRole('switch')).toBeDisabled();
    finish({ error: null });
    await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
  });
});
