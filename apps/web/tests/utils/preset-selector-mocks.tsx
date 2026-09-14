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
    Connected: 'connected',
    Connecting: 'connecting',
    Disconnected: 'disconnected',
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
  toast: { error: vi.fn(), info: mockToastInfo, success: vi.fn() },
}));

/* ---- use-connection ---- */
vi.mock('@/hooks/use-connection', () => ({
  useConnection: () => ({
    connect: mockConnect,
    disconnect: mockDisconnect,
    shouldConnect: false,
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => {
    const callLabels: Record<string, string> = {
      addCharacterLabel: 'Add',
      addCustomCharacter: 'Add custom character',
      addDescriptionPlaceholder: 'Add a description...',
      cancel: 'Cancel',
      characterFallbackName: 'Character',
      characterInstructions: '__NAME__ Instructions',
      chooseCharacter: 'Choose Character',
      clickToAddDescription: 'Click to add a description...',
      deleteCharacterAriaLabel: 'Delete __NAME__',
      deletePreset: 'Delete',
      deletePresetConfirm: 'This cannot be undone.',
      instructionsPlaceholder: 'Enter system instructions',
      upgradePremiumTooltip: 'Upgrade to create custom characters',
      voiceLabel: 'Voice',
      voicePlaceholder: 'Choose a voice',
      voiceSelectorLabel: 'Voice',
      voiceSelectorPlaceholder: 'Choose voice',
    };
    const presetSelectorLabels: Record<string, string> = {
      characterCreated: 'Character created',
      characterRemoved: 'Character removed',
      characterUpdated: 'Character updated',
      failedToCreate: 'Failed to create character',
      failedToDelete: 'Failed to delete character',
      failedToSaveVoice: 'Failed to save voice',
      failedToUpdate: 'Failed to update character',
      voiceUpdated: 'Voice updated',
    };
    const savePresetLabels: Record<string, string> = {
      characterCreated: 'Character created',
      characterSaved: 'Character saved',
      descriptionLabel: 'Description',
      failedToCreate: 'Failed to create character',
      failedToUpdate: 'Failed to update character',
      nameLabel: 'Name',
      save: 'Save',
      saveAsNew: 'Save as new',
      saveAsNewDescription:
        'This will create a new custom character with the current settings.',
      saveAsNewTitle: 'Save as new character',
    };
    const createCharacterLabels: Record<string, string> = {
      cancelButton: 'Cancel',
      characterCount: '__COUNT__/5000 characters',
      createButton: 'Create Character',
      creatingButton: 'Creating...',
      descriptionLabel: 'Description',
      descriptionPlaceholder: 'A brief description of your character...',
      dialogDescription:
        'Create a custom AI character with your own personality and voice.',
      dialogTitle: 'Create New Character',
      errorNameRequired: 'Name is required',
      errorVoiceRequired: 'Please select a voice',
      instructionsLabel: 'Instructions',
      instructionsPlaceholder:
        "Describe your character's personality, speech patterns, backstory...",
      nameLabel: 'Name',
      namePlaceholder: 'e.g., Luna, Marcus, Zara...',
      nameRequired: '*',
      playVoiceSample: 'Play voice sample',
      previewVoice: "Preview __VOICE__'s voice",
      stopVoiceSample: 'Stop voice sample',
      voiceLabel: 'Voice',
      voicePlaceholder: 'Choose a voice',
    };

    return (key: string) => {
      if (namespace === 'call.presetSelector') {
        return presetSelectorLabels[key] ?? key;
      }
      if (namespace === 'call.savePreset') {
        return savePresetLabels[key] ?? key;
      }
      if (namespace === 'call.createCharacter') {
        return createCharacterLabels[key] ?? key;
      }
      return callLabels[key] ?? key;
    };
  },
}));

/* ---- embla-carousel-react (used by Carousel UI component) ---- */
vi.mock('embla-carousel-react', () => ({
  __esModule: true,
  default: () => [vi.fn(), undefined],
}));

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

import { defaultSessionConfig } from '@/data/default-config';
import type { Preset } from '@/data/presets';

/**
 * Factory for creating test presets with sensible defaults.
 * Only `id` is required; everything else can be overridden.
 */
export const makePreset = (
  overrides: Partial<Preset> & { id: string },
): Preset => ({
  instructions: `Instructions for ${overrides.id}`,
  name: overrides.id.charAt(0).toUpperCase() + overrides.id.slice(1),
  sessionConfig: { ...defaultSessionConfig },
  ...overrides,
});

/** The four default characters used across all PresetSelector tests. */
export const defaultPresetsFixture: Preset[] = [
  makePreset({
    id: 'ramona',
    image: 'ramona.webp',
    localizedDescriptions: { en: 'Dominant businesswoman.' },
    name: 'Ramona',
    sessionConfig: { ...defaultSessionConfig, voice: 'Eve' },
  }),
  makePreset({
    id: 'lily',
    image: 'lily.webp',
    localizedDescriptions: { en: 'Shy student girl.' },
    name: 'Lily',
    sessionConfig: { ...defaultSessionConfig, voice: 'Ara' },
  }),
  makePreset({
    id: 'rafal',
    image: 'rafal.webp',
    localizedDescriptions: { en: 'Ex-military commander.' },
    name: 'Rafal',
    sessionConfig: { ...defaultSessionConfig, voice: 'Rex' },
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
    customCharacters: [],
    defaultPresets: defaultPresetsFixture,
    initialInstruction: 'Say hi',
    instructions: 'test instructions',
    language: 'en' as const,
    memory: false,
    sceneInstructions: '',
    selectedPresetId: 'ramona',
    selectedSceneId: null,
    sessionConfig: { ...defaultSessionConfig },
    ...overrides,
  };
}

/* ---- use-playground-state ---- */
vi.mock('@/hooks/use-playground-state', () => ({
  usePlaygroundState: () => ({
    dispatch: mockDispatch,
    helpers: {
      encodeToUrlParams: mockEncodeToUrlParams,
      getAllPresets: (state: PlaygroundState) => [
        ...defaultPresetsFixture,
        ...state.customCharacters,
      ],
      getDefaultPresets: () => defaultPresetsFixture,
      getSelectedPreset: (state: PlaygroundState) =>
        [...defaultPresetsFixture, ...state.customCharacters].find(
          (p) => p.id === state.selectedPresetId,
        ),
    },
    pgState: mockPgStateRef.current,
  }),
}));
