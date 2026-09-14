// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { useConnectionState } from '@livekit/components-react';
import { cleanup, render, screen } from '@testing-library/react';
import { ConnectionState } from 'livekit-client';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CallFaq } from '@/components/call/call-faq';
import { CREDITS_PER_MINUTE } from '@/lib/supabase/constants';

vi.mock('@livekit/components-react', () => ({
  useConnectionState: vi.fn(),
}));

function renderFaq(
  groups = [
    {
      category: 'Preguntas sobre llamadas',
      id: 'liveCalling',
      questions: [
        { answer: '{count} créditos por minuto', question: '¿Cuánto cuesta?' },
      ],
    },
  ],
) {
  return render(
    <NextIntlClientProvider
      locale="es"
      messages={{ landing: { faq: { groups } } }}
    >
      <CallFaq />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(useConnectionState).mockReturnValue(ConnectionState.Disconnected);
});
afterEach(cleanup);

describe('CallFaq', () => {
  it('reads localized FAQ content from the provider and substitutes the credit cost', () => {
    renderFaq();
    expect(
      screen.getByRole('heading', { name: 'Preguntas sobre llamadas' }),
    ).toBeVisible();
    expect(screen.getByText('¿Cuánto cuesta?')).toBeVisible();
    expect(
      screen.getByText(`${CREDITS_PER_MINUTE} créditos por minuto`),
    ).toBeVisible();
  });

  it.each([
    ConnectionState.Connecting,
    ConnectionState.Connected,
    ConnectionState.Reconnecting,
  ])('hides the FAQ while %s', (state) => {
    vi.mocked(useConnectionState).mockReturnValue(state);
    renderFaq();
    expect(screen.queryByTestId('call-faq')).not.toBeInTheDocument();
  });

  it('renders nothing when the live calling group is missing', () => {
    renderFaq([]);
    expect(screen.queryByTestId('call-faq')).not.toBeInTheDocument();
  });
});
