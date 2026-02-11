/**
 * Shared mocks, fixtures, and helpers for PresetSelector component tests.
 *
 * This file extracts all vi.mock() calls and fixture data so the test file
 * stays focused on behaviour assertions only.
 *
 * NOTE: We intentionally avoid `vi.hoisted()` here because Vitest cannot
 * export hoisted variables from non-test files. Regular module-level
 * declarations work because vi.mock() factories are invoked lazily — when
 * the mocked module is first imported, not when vi.mock() is registered —
 * so these variables are guaranteed to be initialised by the time the
 * factories execute.
 */

import { vi } from 'vitest';

import type { PlaygroundState } from '@/data/playground-state';

// ---------------------------------------------------------------------------
// Mock variables — module-level declarations referenced by vi.mock factories
// ---------------------------------------------------------------------------
export const mockConnectionState = { value: 'disconnected' };
export const mockSearchParams = { value: new URLSearchParams() };
export const mockToastInfo = vi.fn();
export const mockDisconnect = vi.fn().mockResolvedValue(undefined);
export const mockConnect = vi.fn().mockResolvedValue(undefined);
export const mockDispatch = vi.fn();
export const mockEncodeToUrlParams = vi.fn().mockReturnValue('');
export const mockPgStateRef: { current: PlaygroundState | null } = {
  current: null,
};

// ---------------------------------------------------------------------------
// Mocks – every external dependency of <PresetSelector> is stubbed here.
// ---------------------------------------------------------------------------

/* ---- livekit ---- */
vi.mock('@livekit/components-react', () => ({
  useConnectionState: () => mockConnectionState.value,
}));
vi.mock('livekit-client', () => ({
  ConnectionState: {
    Disconnected: 'disconnected',
    Connected: 'connected',
    Connecting: 'connecting',
    Reconnecting: 'reconnecting',
  },
}));

/* ---- next/image ---- */
vi.mock('next/image', () => ({
  default: ({
    alt,
    src,
  }: {
    alt: string;
    src: string;
    fill?: boolean;
    className?: string;
  }) => (
    // biome-ignore lint/performance/noImgElement: intentional mock of next/image for tests
    <img alt={alt} height={64} src={src} width={64} />
  ),
}));

/* ---- next/navigation ---- */
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams.value,
}));

/* ---- sonner ---- */
vi.mock('sonner', () => ({
  toast: { info: mockToastInfo, error: vi.fn(), success: vi.fn() },
}));

/* ---- use-connection ---- */
vi.mock('@/hooks/use-connection', () => ({
  useConnection: () => ({
    disconnect: mockDisconnect,
    connect: mockConnect,
    shouldConnect: false,
    dict: { chooseCharacter: 'Choose Character' },
  }),
}));

/* ---- embla-carousel-react (used by Carousel UI component) ---- */
vi.mock('embla-carousel-react', () => ({
  default: () => [vi.fn(), undefined],
  __esModule: true,
}));

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

import { defaultSessionConfig } from '@/data/default-config';
import type { Preset } from '@/data/presets';
import { VoiceId } from '@/data/voices';

/**
 * Factory for creating test presets with sensible defaults.
 * Only `id` is required; everything else can be overridden.
 */
export const makePreset = (
  overrides: Partial<Preset> & { id: string },
): Preset => ({
  name: overrides.id.charAt(0).toUpperCase() + overrides.id.slice(1),
  instructions: `Instructions for ${overrides.id}`,
  sessionConfig: { ...defaultSessionConfig },
  ...overrides,
});

/** The four default characters used across all PresetSelector tests. */
export const defaultPresetsFixture: Preset[] = [
  makePreset({
    id: 'ramona',
    name: 'Ramona',
    localizedDescriptions: { en: 'Dominant businesswoman.' },
    image: 'ramona.webp',
    sessionConfig: { ...defaultSessionConfig, voice: VoiceId.EVE },
  }),
  makePreset({
    id: 'lily',
    name: 'Lily',
    localizedDescriptions: { en: 'Shy student girl.' },
    image: 'lily.webp',
    sessionConfig: { ...defaultSessionConfig, voice: VoiceId.ARA },
  }),
  makePreset({
    id: 'milo',
    name: 'Milo',
    localizedDescriptions: { en: 'Bisexual twink.' },
    image: 'milo.webp',
    sessionConfig: { ...defaultSessionConfig, voice: VoiceId.SAL },
  }),
  makePreset({
    id: 'rafal',
    name: 'Rafal',
    localizedDescriptions: { en: 'Ex-military commander.' },
    image: 'rafal.webp',
    sessionConfig: { ...defaultSessionConfig, voice: VoiceId.REX },
  }),
];

/**
 * Creates a full PlaygroundState with sensible defaults.
 * Pass partial overrides to customise individual fields.
 */
export function createDefaultPgState(
  overrides?: Partial<PlaygroundState>,
): PlaygroundState {
  return {
    sessionConfig: { ...defaultSessionConfig },
    customCharacters: [],
    selectedPresetId: 'ramona',
    instructions: 'test instructions',
    characterOverrides: {},
    language: 'en' as const,
    initialInstruction: 'Say hi',
    defaultPresets: defaultPresetsFixture,
    ...overrides,
  };
}

/* ---- use-playground-state ---- */
vi.mock('@/hooks/use-playground-state', () => ({
  usePlaygroundState: () => ({
    pgState: mockPgStateRef.current,
    dispatch: mockDispatch,
    helpers: {
      getDefaultPresets: () => defaultPresetsFixture,
      getSelectedPreset: (state: PlaygroundState) =>
        [...defaultPresetsFixture, ...state.customCharacters].find(
          (p) => p.id === state.selectedPresetId,
        ),
      getAllPresets: (state: PlaygroundState) => [
        ...defaultPresetsFixture,
        ...state.customCharacters,
      ],
      encodeToUrlParams: mockEncodeToUrlParams,
    },
  }),
}));
