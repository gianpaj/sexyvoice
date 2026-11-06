// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LoginForm } from '@/app/[lang]/(auth)/login/login-form';
import { SignUpForm } from '@/app/[lang]/(auth)/signup/signup-form';
import messages from '@/messages/en.json';

const { auth, push, fetchMock } = vi.hoisted(() => ({
  auth: { signInWithOAuth: vi.fn(), signInWithPassword: vi.fn() },
  push: vi.fn(),
  fetchMock: vi.fn(),
}));
const destination = '/en/dashboard/clone?demo=heike&take=calmSlow';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  useSearchParams: () =>
    new URLSearchParams({
      redirect_to: '/en/dashboard/clone?demo=heike&take=calmSlow',
    }),
}));
vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ auth }),
}));
vi.mock('@/hooks/use-local-storage', () => ({
  useLocalStorage: () => ['', vi.fn()],
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), dismiss: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  auth.signInWithOAuth.mockResolvedValue({ error: null });
  auth.signInWithPassword.mockResolvedValue({ error: null });
  fetchMock.mockResolvedValue(new Response('{}', { status: 201 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const wrap = (children: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>,
  );

const submitEmail = () => {
  fireEvent.change(screen.getByLabelText(messages.auth.signup.email), {
    target: { value: 'voice@example.com' },
  });
  fireEvent.change(screen.getByLabelText(messages.auth.signup.password), {
    target: { value: 'password123' },
  });
  fireEvent.submit(document.querySelector('form')!);
};

describe('demo auth handoff', () => {
  it('keeps the selection in login and the signup link', async () => {
    wrap(<LoginForm lang="en" />);
    expect(
      screen.getByRole('link', { name: messages.auth.login.signUp }),
    ).toHaveAttribute(
      'href',
      `/en/signup?redirect_to=${encodeURIComponent(destination)}`,
    );
    submitEmail();
    await waitFor(() => expect(push).toHaveBeenCalledWith(destination));
  });

  it('passes the selection into both OAuth callbacks', async () => {
    const { unmount } = wrap(<LoginForm lang="en" />);
    fireEvent.click(screen.getByText(messages.auth.login.signInWithGoogle));
    await waitFor(() => expect(auth.signInWithOAuth).toHaveBeenCalled());
    expect(
      new URL(
        auth.signInWithOAuth.mock.calls[0][0].options.redirectTo,
      ).searchParams.get('redirect_to'),
    ).toBe(destination);
    unmount();
    auth.signInWithOAuth.mockClear();
    wrap(<SignUpForm lang="en" redirectTo={destination} />);
    fireEvent.click(screen.getByText('Sign up with Google'));
    await waitFor(() => expect(auth.signInWithOAuth).toHaveBeenCalled());
    expect(
      new URL(
        auth.signInWithOAuth.mock.calls[0][0].options.redirectTo,
      ).searchParams.get('redirect_to'),
    ).toBe(destination);
  });

  it('passes the selection into email signup and the login link', async () => {
    wrap(<SignUpForm lang="en" redirectTo={destination} />);
    expect(
      screen.getByRole('link', { name: messages.auth.signup.signIn }),
    ).toHaveAttribute(
      'href',
      `/en/login?redirect_to=${encodeURIComponent(destination)}`,
    );
    submitEmail();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/auth/signup',
        expect.objectContaining({
          body: JSON.stringify({
            email: 'voice@example.com',
            password: 'password123',
            redirectTo: destination,
          }),
        }),
      ),
    );
  });
});
