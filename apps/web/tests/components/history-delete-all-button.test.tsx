// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handleDeleteAllAction } from '@/app/[lang]/(dashboard)/dashboard/history/actions';
import { DeleteAllButton } from '@/app/[lang]/(dashboard)/dashboard/history/delete-all-button';
import messages from '@/messages/en.json';

vi.mock('@/app/[lang]/(dashboard)/dashboard/history/actions', () => ({
  handleDeleteAllAction: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

function renderDeleteAllButton({ count = 2, disabled = false } = {}) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(
    ['audio_files', 'user-1'],
    [{ id: 'audio-1' }, { id: 'audio-2' }],
  );

  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={queryClient}>
        <DeleteAllButton count={count} disabled={disabled} userId="user-1" />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );

  return queryClient;
}

describe('DeleteAllButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(handleDeleteAllAction).mockResolvedValue({
      deletedCount: 1,
      success: true,
    });
  });

  it('requires confirmation before deleting history', async () => {
    const user = userEvent.setup();
    renderDeleteAllButton();

    await user.click(screen.getByRole('button', { name: 'Delete all' }));

    const dialog = screen.getByRole('alertdialog');
    expect(
      within(dialog).getByRole('heading', {
        name: 'Delete all audio files?',
      }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        'All 2 audio files will be removed from your history. This action cannot be undone.',
      ),
    ).toBeInTheDocument();
    expect(handleDeleteAllAction).not.toHaveBeenCalled();
  });

  it('clears the history cache after confirmation succeeds', async () => {
    const user = userEvent.setup();
    const queryClient = renderDeleteAllButton();

    await user.click(screen.getByRole('button', { name: 'Delete all' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Delete all',
      }),
    );

    await waitFor(() => expect(handleDeleteAllAction).toHaveBeenCalledOnce());
    expect(queryClient.getQueryData(['audio_files', 'user-1'])).toEqual([]);
    expect(toast.success).toHaveBeenCalledWith('All audio files deleted');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('keeps the existing history and reports a failed deletion', async () => {
    const user = userEvent.setup();
    const queryClient = renderDeleteAllButton();
    vi.mocked(handleDeleteAllAction).mockRejectedValue(
      new Error('Delete failed'),
    );

    await user.click(screen.getByRole('button', { name: 'Delete all' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Delete all',
      }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to delete all audio files. Please try again.',
      ),
    );
    expect(queryClient.getQueryData(['audio_files', 'user-1'])).toEqual([
      { id: 'audio-1' },
      { id: 'audio-2' },
    ]);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('is disabled when there is no history', () => {
    renderDeleteAllButton({ count: 0, disabled: true });

    const button = screen.getByRole('button', { name: 'Delete all' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('data-size', 'sm');
  });
});
