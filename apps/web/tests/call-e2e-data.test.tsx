import type { ComponentProps, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import CallLayout from '@/app/[lang]/(dashboard)/dashboard/call/layout';
import CallPage from '@/app/[lang]/(dashboard)/dashboard/call/page';
import { ConfigurationForm } from '@/components/call/configuration-form';
import CreditsSection from '@/components/credits-section';
import { PlaygroundStateProvider } from '@/hooks/use-playground-state';
import {
  E2E_CALL_INSTRUCTION_CONFIG,
  E2E_CALL_VOICES,
  E2E_CREDIT_TRANSACTIONS,
  E2E_PUBLIC_CALL_CHARACTERS,
  isE2E,
} from '@/lib/e2e-mocks';
import { getCallInstructionConfig } from '@/lib/edge-config/call-instructions';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import {
  getCallVoices,
  getPublicCallCharacters,
  getUserCallCharacters,
  hasUserPaid,
} from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';

vi.mock('server-only', () => ({}));
vi.mock('@livekit/components-styles', () => ({}));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/auth', () => ({ getVerifiedClaims: vi.fn() }));
vi.mock('@/lib/supabase/queries', () => ({
  getCallVoices: vi.fn(),
  getPublicCallCharacters: vi.fn(),
  getUserCallCharacters: vi.fn(),
  hasUserPaid: vi.fn(),
}));
vi.mock('@/lib/edge-config/call-instructions', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/lib/edge-config/call-instructions')
  >()),
  getCallInstructionConfig: vi.fn(),
}));
vi.mock('@/hooks/use-playground-state', () => ({
  PlaygroundStateProvider: vi.fn(
    ({ children }: { children: ReactNode }) => children,
  ),
}));
vi.mock('@/hooks/use-connection', () => ({
  ConnectionProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/components/call/room-wrapper', () => ({
  RoomWrapper: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/components/call/configuration-form', () => ({
  ConfigurationForm: vi.fn(() => null),
}));
vi.mock('@/components/credits-section', () => ({ default: vi.fn(() => null) }));
vi.mock('@/components/call/chat', () => ({ Chat: () => null }));
vi.mock('@/components/call/call-faq', () => ({ CallFaq: () => null }));

const userId = 'verified-call-user';
const params = () => Promise.resolve({ lang: 'de' as const });
const liveCredits = [{ amount: 321 }];
const query = {
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockResolvedValue({ data: liveCredits }),
  select: vi.fn().mockReturnThis(),
};
const from = vi.fn(() => query);
const supabase = { from } as unknown as Awaited<
  ReturnType<typeof createClient>
>;

function providerProps() {
  expect(PlaygroundStateProvider).toHaveBeenCalledOnce();
  return vi.mocked(PlaygroundStateProvider).mock.calls[0][0];
}

function expectAuthenticated() {
  expect(createClient).toHaveBeenCalledOnce();
  expect(getVerifiedClaims).toHaveBeenCalledExactlyOnceWith(supabase);
}

function expectNoDataCalls() {
  for (const mock of [
    from,
    getCallVoices,
    getPublicCallCharacters,
    getUserCallCharacters,
    hasUserPaid,
    getCallInstructionConfig,
  ]) {
    expect(mock).not.toHaveBeenCalled();
  }
}

function expectPageProps(
  creditTransactions: ComponentProps<
    typeof CreditsSection
  >['creditTransactions'],
  callVoices: ComponentProps<typeof ConfigurationForm>['callVoices'],
  isPaidUser: boolean,
) {
  expect(CreditsSection).toHaveBeenCalledOnce();
  expect(vi.mocked(CreditsSection).mock.calls[0][0]).toEqual({
    creditTransactions,
    doNotToggleSidebar: true,
    lang: 'de',
    showMinutes: true,
    userId,
  });
  expect(ConfigurationForm).toHaveBeenCalledOnce();
  expect(vi.mocked(ConfigurationForm).mock.calls[0][0]).toEqual({
    callVoices,
    isPaidUser,
    lang: 'de',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('E2E_TEST_MODE', 'true');
  vi.stubEnv('VERCEL_ENV', 'preview');
  vi.mocked(createClient).mockResolvedValue(supabase);
  vi.mocked(getVerifiedClaims).mockResolvedValue({ sub: userId } as NonNullable<
    Awaited<ReturnType<typeof getVerifiedClaims>>
  >);
  vi.mocked(hasUserPaid).mockResolvedValue(true);
  vi.mocked(getPublicCallCharacters).mockResolvedValue([]);
  vi.mocked(getUserCallCharacters).mockResolvedValue([]);
  vi.mocked(getCallVoices).mockResolvedValue([]);
  vi.mocked(getCallInstructionConfig).mockResolvedValue({
    defaultInstructions: 'Live default instructions',
    initialInstruction: 'Live initial instruction',
    presetInstructions: { 'live-public': 'Live preset override' },
  });
});

afterEach(() => vi.unstubAllEnvs());

describe('call E2E data', () => {
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

  it('maps deterministic public presets in order without fetching layout data', async () => {
    const html = renderToStaticMarkup(
      await CallLayout({ children: <span>Call child</span>, params: params() }),
    );

    expect(html).toContain('Call child');
    expectAuthenticated();
    expectNoDataCalls();
    const props = providerProps();
    expect(props.initialCustomCharacters).toEqual([]);
    expect(props.defaultPresets?.map((preset) => preset.name)).toEqual([
      'Lily',
      'Ramona',
      'Rafal',
    ]);
    expect(props.defaultPresets?.map((preset) => preset.id)).toEqual(
      E2E_PUBLIC_CALL_CHARACTERS.map((character) => character.id),
    );
    expect(props.defaultPresets?.map((preset) => preset.voiceName)).toEqual([
      'Ara',
      'Eve',
      'Rex',
    ]);
    for (const character of E2E_PUBLIC_CALL_CHARACTERS) {
      expect(character.prompts).toEqual({ type: 'call' });
      expect(character).not.toHaveProperty('user_id');
      expect(
        E2E_CALL_VOICES.find((voice) => voice.id === character.voice_id),
      ).toMatchObject(character.voices);
    }
    expect(props.defaultPresets?.map((preset) => preset.instructions)).toEqual([
      '',
      '',
      '',
    ]);
    expect(props.initialState).toEqual({
      initialInstruction: E2E_CALL_INSTRUCTION_CONFIG.initialInstruction,
      instructions: E2E_CALL_INSTRUCTION_CONFIG.defaultInstructions,
      language: 'de',
      selectedPresetId: E2E_PUBLIC_CALL_CHARACTERS[0].id,
    });
  });

  it('passes fixture credits and voices with unpaid entitlement to the page', async () => {
    renderToStaticMarkup(await CallPage({ params: params() }));

    expectAuthenticated();
    expectNoDataCalls();
    expectPageProps(E2E_CREDIT_TRANSACTIONS, E2E_CALL_VOICES, false);
  });

  it.each(['preview', 'production'])(
    'checks page authentication before data in %s',
    async (env) => {
      vi.stubEnv('VERCEL_ENV', env);
      vi.mocked(getVerifiedClaims).mockResolvedValue(null);

      const html = renderToStaticMarkup(await CallPage({ params: params() }));

      expect(html).toContain('notLoggedIn');
      expectAuthenticated();
      expectNoDataCalls();
      expect(CreditsSection).not.toHaveBeenCalled();
      expect(ConfigurationForm).not.toHaveBeenCalled();
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

  it('loads and maps public and paid custom characters with live instructions', async () => {
    const publicCharacter = {
      ...E2E_PUBLIC_CALL_CHARACTERS[0],
      id: 'live-public',
      localized_descriptions: { de: 'Beschreibung', invalid: 42 },
      name: 'Live public',
      prompts: {
        localized_prompts: { de: 'Lokalisierte Anweisung' },
        prompt: 'Public prompt',
        type: 'call' as const,
      },
      session_config: {
        max_output_tokens: 256,
        temperature: 0.4,
        voice: 'Rex',
      },
      voices: { name: 'Ara', sample_url: 'https://example.com/ara.mp3' },
    };
    const customCharacter = {
      ...publicCharacter,
      id: 'live-custom',
      is_public: false,
      name: 'Paid custom',
      session_config: {},
    };
    vi.mocked(getPublicCallCharacters).mockResolvedValue([publicCharacter]);
    vi.mocked(getUserCallCharacters).mockResolvedValue([customCharacter]);

    renderToStaticMarkup(
      await CallLayout({ children: null, params: params() }),
    );

    expectAuthenticated();
    expect(getCallInstructionConfig).toHaveBeenCalledOnce();
    expect(getPublicCallCharacters).toHaveBeenCalledOnce();
    expect(hasUserPaid).toHaveBeenCalledExactlyOnceWith(userId);
    expect(getUserCallCharacters).toHaveBeenCalledExactlyOnceWith(userId);
    const props = providerProps();
    expect(props.defaultPresets).toHaveLength(1);
    expect(props.defaultPresets?.[0]).toMatchObject({
      id: 'live-public',
      instructions: 'Live preset override',
      isPublic: publicCharacter.is_public,
      localizedDescriptions: { de: 'Beschreibung' },
      localizedInstructions: { de: 'Lokalisierte Anweisung' },
      name: 'Live public',
      promptType: 'call',
      sessionConfig: { maxOutputTokens: 256, temperature: 0.4, voice: 'Rex' },
      voiceName: 'Ara',
      voiceSampleUrl: 'https://example.com/ara.mp3',
    });
    expect(props.initialCustomCharacters).toHaveLength(1);
    expect(props.initialCustomCharacters?.[0]).toMatchObject({
      id: 'live-custom',
      instructions: 'Public prompt',
      isPublic: false,
      name: 'Paid custom',
      sessionConfig: { maxOutputTokens: null, temperature: 0.8, voice: 'Ara' },
    });
    expect(props.initialState).toEqual({
      initialInstruction: 'Live initial instruction',
      instructions: 'Live default instructions',
      language: 'de',
      selectedPresetId: 'live-public',
    });
  });

  it('skips custom characters for unpaid users and handles empty public presets', async () => {
    vi.mocked(hasUserPaid).mockResolvedValue(false);
    renderToStaticMarkup(
      await CallLayout({ children: null, params: params() }),
    );

    expect(hasUserPaid).toHaveBeenCalledExactlyOnceWith(userId);
    expect(getUserCallCharacters).not.toHaveBeenCalled();
    expect(providerProps()).toMatchObject({
      defaultPresets: [],
      initialCustomCharacters: [],
      initialState: { selectedPresetId: null },
    });
  });

  it('queries live page data scoped to the verified user', async () => {
    const voices = [
      { ...E2E_CALL_VOICES[0], id: 'live-voice', name: 'Live voice' },
    ];
    vi.mocked(getCallVoices).mockResolvedValue(voices);

    renderToStaticMarkup(await CallPage({ params: params() }));

    expectAuthenticated();
    expect(from).toHaveBeenCalledExactlyOnceWith('credit_transactions');
    expect(query.select).toHaveBeenCalledExactlyOnceWith('amount');
    expect(query.eq).toHaveBeenCalledExactlyOnceWith('user_id', userId);
    expect(query.order).toHaveBeenCalledExactlyOnceWith('created_at', {
      ascending: false,
    });
    expect(hasUserPaid).toHaveBeenCalledExactlyOnceWith(userId);
    expect(getCallVoices).toHaveBeenCalledOnce();
    expectPageProps(liveCredits, voices, true);
  });
});
