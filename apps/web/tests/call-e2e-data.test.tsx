import { prefetchQuery } from '@supabase-cache-helpers/postgrest-react-query';
import { cookies } from 'next/headers';
import type { ComponentProps, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import CallLayout from '@/app/[lang]/(dashboard)/dashboard/call/layout';
import CallPage from '@/app/[lang]/(dashboard)/dashboard/call/page';
import DashboardUI from '@/app/[lang]/(dashboard)/dashboard.ui';
import DashboardLayout from '@/app/[lang]/(dashboard)/layout';
import { CallExperience } from '@/components/call/call-experience';
import { CallSetupProvider } from '@/components/call/call-setup';
import CreditsSection from '@/components/credits-section';
import { getE2ECallUser } from '@/lib/e2e-call-user';
import {
  E2E_CALL_VOICES,
  E2E_CREDIT_TRANSACTIONS,
  E2E_PUBLIC_CALL_CHARACTERS,
  E2E_SAVED_CALL_VOICES,
  isE2E,
} from '@/lib/e2e-mocks';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import {
  getCallVoices,
  getCreditTransactionAmounts,
  getPublicCallCharacters,
  getUserCallCharacters,
  hasUserPaid,
} from '@/lib/supabase/queries';
import { getCreditsQuery } from '@/lib/supabase/queries.client';
import { createClient } from '@/lib/supabase/server';

vi.mock('server-only', () => ({}));
vi.mock('@livekit/components-styles', () => ({}));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('@supabase-cache-helpers/postgrest-react-query', () => ({
  prefetchQuery: vi.fn(),
}));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  HydrationBoundary: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/components/react-query-client-provider', () => ({
  ReactQueryClientProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/app/[lang]/(dashboard)/dashboard.ui', () => ({
  default: vi.fn(({ children }: { children: ReactNode }) => children),
}));
vi.mock('@/lib/banners/resolve-banner', () => ({
  resolveActiveBanner: vi.fn(() => null),
}));
vi.mock('@/lib/supabase/queries.client', () => ({
  getCreditsQuery: vi.fn(),
}));
vi.mock('next-intl/server', () => ({
  getMessages: async () => ({}),
  getTranslations: async () => (key: string) => key,
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/call-voices', () => ({
  getSavedCallVoices: vi.fn(async () => []),
}));
vi.mock('@/lib/supabase/auth', () => ({ getVerifiedClaims: vi.fn() }));
vi.mock('@/lib/supabase/queries', () => ({
  getCallVoices: vi.fn(),
  getCreditTransactionAmounts: vi.fn(),
  getPublicCallCharacters: vi.fn(),
  getUserCallCharacters: vi.fn(),
  hasUserPaid: vi.fn(),
}));
vi.mock('@/components/call/call-setup', () => ({
  CallSetupProvider: vi.fn(({ children }: { children: ReactNode }) => children),
}));
vi.mock('@/components/call/call-session', () => ({
  CallSessionProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/components/call/room-wrapper', () => ({
  RoomWrapper: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/components/call/call-experience', () => ({
  CallExperience: vi.fn(
    ({
      children,
      e2eFixtures,
      mobileCredits,
    }: {
      children?: ReactNode;
      e2eFixtures?: boolean;
      mobileCredits?: ReactNode;
    }) => (
      <div data-e2e-call-fixtures={e2eFixtures ? '' : undefined}>
        {mobileCredits}
        {children}
      </div>
    ),
  ),
}));
vi.mock('@/components/credits-section', () => ({ default: vi.fn(() => null) }));
vi.mock('@/components/call/call-faq', () => ({ CallFaq: () => null }));

const userId = 'verified-call-user';
const params = () => Promise.resolve({ lang: 'de' as const });
const liveCredits = [{ amount: 321 }];
const cookieStore = {
  get: vi.fn(),
  getAll: vi.fn(() => []),
};

function setCallUserCookie(value: string | undefined) {
  cookieStore.get.mockImplementation((name: string) =>
    name === 'e2e-call-user' && value !== undefined
      ? { name, value }
      : undefined,
  );
}
const supabase = {} as unknown as Awaited<ReturnType<typeof createClient>>;

function providerProps() {
  expect(CallSetupProvider).toHaveBeenCalledOnce();
  return vi.mocked(CallSetupProvider).mock.calls[0][0];
}

function expectAuthenticated() {
  expect(createClient).toHaveBeenCalledOnce();
  expect(getVerifiedClaims).toHaveBeenCalledExactlyOnceWith(supabase);
}

function expectNoDataCalls() {
  for (const mock of [
    getCallVoices,
    getPublicCallCharacters,
    getUserCallCharacters,
    hasUserPaid,
    getCreditTransactionAmounts,
    getCreditsQuery,
    prefetchQuery,
  ]) {
    expect(mock).not.toHaveBeenCalled();
  }
}

function expectPageProps(
  creditTransactions: ComponentProps<
    typeof CreditsSection
  >['creditTransactions'],
  callVoices: ComponentProps<typeof CallExperience>['callVoices'],
  isPaidUser: boolean,
  savedVoices: ComponentProps<typeof CallExperience>['savedVoices'] = [],
) {
  expect(CreditsSection).toHaveBeenCalledOnce();
  expect(vi.mocked(CreditsSection).mock.calls[0][0]).toEqual({
    creditTransactions,
    doNotToggleSidebar: true,
    showMinutes: true,
    userId,
  });
  expect(CallExperience).toHaveBeenCalledOnce();
  expect(vi.mocked(CallExperience).mock.calls[0][0]).toEqual(
    expect.objectContaining({ callVoices, isPaidUser, savedVoices }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('E2E_TEST_MODE', 'true');
  vi.stubEnv('VERCEL_ENV', 'preview');
  setCallUserCookie(undefined);
  vi.mocked(cookies).mockResolvedValue(
    cookieStore as unknown as Awaited<ReturnType<typeof cookies>>,
  );
  vi.mocked(getCreditTransactionAmounts).mockResolvedValue(liveCredits);
  vi.mocked(createClient).mockResolvedValue(supabase);
  vi.mocked(getVerifiedClaims).mockResolvedValue({ sub: userId } as NonNullable<
    Awaited<ReturnType<typeof getVerifiedClaims>>
  >);
  vi.mocked(hasUserPaid).mockResolvedValue(true);
  vi.mocked(getPublicCallCharacters).mockResolvedValue([]);
  vi.mocked(getUserCallCharacters).mockResolvedValue([]);
  vi.mocked(getCallVoices).mockResolvedValue([]);
});

afterEach(() => vi.unstubAllEnvs());

describe('call E2E data', () => {
  it.each([
    ['free', false],
    ['paid', true],
    [undefined, false],
    ['invalid', false],
  ] as const)('resolves cookie=%s to paid=%s', async (cookie, isPaidUser) => {
    setCallUserCookie(cookie);

    await expect(getE2ECallUser()).resolves.toEqual({ isPaidUser });
    expect(cookies).toHaveBeenCalledOnce();
    expect(cookieStore.get).toHaveBeenCalledExactlyOnceWith('e2e-call-user');
    expectNoDataCalls();
  });

  it.each([
    ['free', false],
    ['paid', true],
    [undefined, false],
    ['invalid', false],
  ] as const)(
    'shares cookie=%s entitlement across the page and dashboard without live data calls',
    async (cookie, isPaidUser) => {
      setCallUserCookie(cookie);
      vi.mocked(hasUserPaid).mockResolvedValue(!isPaidUser);

      const page = await CallPage({
        params: params(),
        searchParams: Promise.resolve({}),
      });
      const call = CallLayout({ children: page });
      const html = renderToStaticMarkup(
        await DashboardLayout({ children: call, params: params() }),
      );

      expect(html).toContain('data-e2e-call-fixtures=""');
      expectPageProps(
        E2E_CREDIT_TRANSACTIONS,
        E2E_CALL_VOICES,
        isPaidUser,
        isPaidUser ? E2E_SAVED_CALL_VOICES : [],
      );
      expect(DashboardUI).toHaveBeenCalledOnce();
      expect(vi.mocked(DashboardUI).mock.calls[0][0]).toMatchObject({
        creditTransactions: E2E_CREDIT_TRANSACTIONS,
        isPaidUser,
        lang: 'de',
        userId,
      });
      expect(providerProps().customCharacters).toEqual([]);
      expect(createClient).toHaveBeenCalledTimes(2);
      expect(getVerifiedClaims).toHaveBeenCalledTimes(2);
      expectNoDataCalls();
    },
  );
  it.each([
    ['true', 'preview', true],
    ['true', undefined, true],
    ['true', 'production', false],
    ['false', 'preview', false],
    [undefined, 'preview', false],
    ['TRUE', 'preview', false],
  ] as const)(
    'gates real isE2E with flag=%s and deployment=%s',
    (flag, env, expected) => {
      vi.stubEnv('E2E_TEST_MODE', flag);
      vi.stubEnv('VERCEL_ENV', env);
      expect(isE2E()).toBe(expected);
    },
  );

  it('maps deterministic public presets in order without fetching live data', async () => {
    renderToStaticMarkup(
      await CallPage({ params: params(), searchParams: Promise.resolve({}) }),
    );

    expectAuthenticated();
    expectNoDataCalls();
    const props = providerProps();
    expect(props.customCharacters).toEqual([]);
    expect(
      props.predefinedCharacters?.map((character) => character.name),
    ).toEqual(['Lily', 'Ramona', 'Rafal']);
    expect(
      props.predefinedCharacters?.map((character) => character.id),
    ).toEqual(E2E_PUBLIC_CALL_CHARACTERS.map((character) => character.id));
    expect(
      props.predefinedCharacters?.map(
        (character) => character.sessionConfig.voice,
      ),
    ).toEqual(['Ara', 'Eve', 'Rex']);
    for (const character of E2E_PUBLIC_CALL_CHARACTERS) {
      expect(character).not.toHaveProperty('prompts');
      expect(character).not.toHaveProperty('user_id');
      expect(
        E2E_CALL_VOICES.find(
          (voice) => voice.name === character.session_config.voice,
        ),
      ).toMatchObject(character.voices);
    }
    expect(
      props.predefinedCharacters?.map((character) => character.prompt),
    ).toEqual(['', '', '']);
    expect(props.language).toBe('de');
    expect(props.linkedCharacterId).toBeNull();
  });

  it.each([
    [E2E_PUBLIC_CALL_CHARACTERS[1].id, E2E_PUBLIC_CALL_CHARACTERS[1].id],
    ['1c9a4f3e-0000-4000-8000-000000000001', null],
    [[E2E_PUBLIC_CALL_CHARACTERS[1].id, 'other'], null],
  ])('resolves the link ?preset=%s on the server', async (preset, linked) => {
    renderToStaticMarkup(
      await CallPage({
        params: params(),
        searchParams: Promise.resolve({ preset }),
      }),
    );

    expect(providerProps().linkedCharacterId).toBe(linked);
    expect(vi.mocked(CallExperience).mock.lastCall?.[0].linkedCharacterId).toBe(
      linked,
    );
  });

  it('hands a return from the Clone page to the experience', async () => {
    renderToStaticMarkup(
      await CallPage({
        params: params(),
        searchParams: Promise.resolve({ custom: '1', voice: 'voice-id' }),
      }),
    );

    expect(
      vi.mocked(CallExperience).mock.lastCall?.[0].returnFromClone,
    ).toEqual({ voiceId: 'voice-id' });
  });

  it('passes fixture credits and voices with unpaid entitlement to the page', async () => {
    const html = renderToStaticMarkup(
      await CallPage({ params: params(), searchParams: Promise.resolve({}) }),
    );
    expect(html).toContain('data-e2e-call-fixtures=""');

    expectAuthenticated();
    expectNoDataCalls();
    expectPageProps(E2E_CREDIT_TRANSACTIONS, E2E_CALL_VOICES, false);
  });

  it.each(['preview', 'production'])(
    'checks page authentication before data in %s',
    async (env) => {
      vi.stubEnv('VERCEL_ENV', env);
      vi.mocked(getVerifiedClaims).mockResolvedValue(null);

      const html = renderToStaticMarkup(
        await CallPage({ params: params(), searchParams: Promise.resolve({}) }),
      );

      expect(html).toContain('notLoggedIn');
      expectAuthenticated();
      expectNoDataCalls();
      expect(CreditsSection).not.toHaveBeenCalled();
      expect(CallExperience).not.toHaveBeenCalled();
    },
  );
});

describe.each([
  ['normal mode', 'false', 'preview'],
  ['production with the E2E flag enabled', 'true', 'production'],
])('call live data in %s', (_label, flag, env) => {
  beforeEach(() => {
    vi.stubEnv('E2E_TEST_MODE', flag);
    vi.stubEnv('VERCEL_ENV', env);
  });

  it('ignores a paid fixture cookie in the resolver', async () => {
    setCallUserCookie('paid');

    await expect(getE2ECallUser()).resolves.toBeNull();
    expect(cookies).not.toHaveBeenCalled();
    expect(cookieStore.get).not.toHaveBeenCalled();
  });

  it('uses unpaid database entitlement across the page and dashboard despite a paid cookie', async () => {
    setCallUserCookie('paid');
    vi.mocked(hasUserPaid).mockResolvedValue(false);

    const page = await CallPage({
      params: params(),
      searchParams: Promise.resolve({}),
    });
    const call = CallLayout({ children: page });
    const html = renderToStaticMarkup(
      await DashboardLayout({ children: call, params: params() }),
    );

    expect(html).not.toContain('data-e2e-call-fixtures');
    expectPageProps(liveCredits, [], false);
    expect(DashboardUI).toHaveBeenCalledOnce();
    expect(vi.mocked(DashboardUI).mock.calls[0][0]).toMatchObject({
      creditTransactions: liveCredits,
      isPaidUser: false,
      lang: 'de',
      userId,
    });
    expect(hasUserPaid).toHaveBeenCalledTimes(2);
    for (const args of vi.mocked(hasUserPaid).mock.calls) {
      expect(args).toEqual([userId]);
    }
    // React cache() shares this query across the page and layout per request;
    // the test renders outside a request, so each one calls the mock.
    expect(getCreditTransactionAmounts).toHaveBeenCalledTimes(2);
    expect(getCreditsQuery).toHaveBeenCalledExactlyOnceWith(supabase, userId);
    expect(prefetchQuery).toHaveBeenCalledOnce();
    expect(getPublicCallCharacters).toHaveBeenCalledOnce();
    expect(getCallVoices).toHaveBeenCalledOnce();
    expect(getUserCallCharacters).not.toHaveBeenCalled();
    expect(providerProps().customCharacters).toEqual([]);
    expect(cookieStore.get).not.toHaveBeenCalled();
  });

  it('loads and maps public and paid custom characters', async () => {
    const publicCharacter = {
      ...E2E_PUBLIC_CALL_CHARACTERS[0],
      id: 'live-public',
      localized_descriptions: { de: 'Beschreibung', invalid: 42 },
      name: 'Live public',
      session_config: {
        max_output_tokens: 256,
        temperature: 0.4,
        voice: 'Rex',
      },
      voices: { sample_url: 'https://example.com/ara.mp3' },
    };
    const customCharacter = {
      ...publicCharacter,
      id: 'live-custom',
      is_public: false,
      name: 'Paid custom',
      prompts: {
        localized_prompts: { de: 'Lokalisierte Anweisung' },
        prompt: 'Custom prompt',
      },
      session_config: {},
    };
    vi.mocked(getPublicCallCharacters).mockResolvedValue([publicCharacter]);
    vi.mocked(getUserCallCharacters).mockResolvedValue([customCharacter]);

    renderToStaticMarkup(
      await CallPage({ params: params(), searchParams: Promise.resolve({}) }),
    );

    expectAuthenticated();
    expect(getPublicCallCharacters).toHaveBeenCalledOnce();
    expect(hasUserPaid).toHaveBeenCalledExactlyOnceWith(userId);
    expect(getUserCallCharacters).toHaveBeenCalledExactlyOnceWith(userId);
    const props = providerProps();
    expect(props.predefinedCharacters).toHaveLength(1);
    // Predefined prompt text never reaches the client props.
    expect(props.predefinedCharacters?.[0]).toMatchObject({
      id: 'live-public',
      isPublic: publicCharacter.is_public,
      localizedDescriptions: { de: 'Beschreibung' },
      localizedPrompts: {},
      name: 'Live public',
      prompt: '',
      sessionConfig: { maxOutputTokens: 256, temperature: 0.4, voice: 'Rex' },
      voiceSampleUrl: 'https://example.com/ara.mp3',
    });
    expect(props.customCharacters).toHaveLength(1);
    expect(props.customCharacters?.[0]).toMatchObject({
      id: 'live-custom',
      isPublic: false,
      localizedPrompts: { de: 'Lokalisierte Anweisung' },
      prompt: 'Custom prompt',
      name: 'Paid custom',
      sessionConfig: { maxOutputTokens: null, temperature: 0.8, voice: 'Ara' },
    });
    expect(props.language).toBe('de');
  });

  it('skips custom characters for unpaid users and handles empty public presets', async () => {
    vi.mocked(hasUserPaid).mockResolvedValue(false);
    renderToStaticMarkup(
      await CallPage({ params: params(), searchParams: Promise.resolve({}) }),
    );

    expect(hasUserPaid).toHaveBeenCalledExactlyOnceWith(userId);
    expect(getUserCallCharacters).not.toHaveBeenCalled();
    expect(providerProps()).toMatchObject({
      customCharacters: [],
      linkedCharacterId: null,
      predefinedCharacters: [],
    });
  });

  it('queries live page data scoped to the verified user', async () => {
    const voices = [
      { ...E2E_CALL_VOICES[0], id: 'live-voice', name: 'Live voice' },
    ];
    vi.mocked(getCallVoices).mockResolvedValue(voices);

    const html = renderToStaticMarkup(
      await CallPage({ params: params(), searchParams: Promise.resolve({}) }),
    );
    expect(html).not.toContain('data-e2e-call-fixtures');

    expectAuthenticated();
    expect(getCreditTransactionAmounts).toHaveBeenCalledExactlyOnceWith(userId);
    expect(hasUserPaid).toHaveBeenCalledExactlyOnceWith(userId);
    expect(getCallVoices).toHaveBeenCalledOnce();
    expectPageProps(liveCredits, voices, true);
  });
});
