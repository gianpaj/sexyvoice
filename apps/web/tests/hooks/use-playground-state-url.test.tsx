// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import { defaultSessionConfig } from '@/data/default-config';
import type { Preset } from '@/data/presets';
import {
  PlaygroundStateProvider,
  usePlaygroundState,
} from '@/hooks/use-playground-state';

const savedCharacter: Preset = {
  id: '9f521791-9ee4-43d9-8345-a9f9e5ad7632',
  instructions: 'You are Luna.',
  name: 'luna2',
  sessionConfig: { ...defaultSessionConfig, voice: 'Rex' },
};

function makeWrapper(initialCustomCharacters: Preset[]) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <PlaygroundStateProvider
        initialCustomCharacters={initialCustomCharacters}
      >
        {children}
      </PlaygroundStateProvider>
    );
  };
}

describe('usePlaygroundState — preset URL', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('selects a saved character from an old link without duplicating it', () => {
    const search = `?preset=${savedCharacter.id}&presetName=${savedCharacter.name}&instructions=Old+prompt&sessionConfig.voice=Rex`;
    window.history.replaceState({}, '', `/en/dashboard/call${search}`);

    const { result } = renderHook(() => usePlaygroundState(), {
      wrapper: makeWrapper([savedCharacter]),
    });

    expect(result.current.pgState.customCharacters).toEqual([savedCharacter]);
    expect(result.current.pgState.selectedPresetId).toBe(savedCharacter.id);
    expect(result.current.pgState.instructions).toBe(
      savedCharacter.instructions,
    );
    expect(window.location.search).toBe(`?preset=${savedCharacter.id}`);
  });

  it.each([
    '?preset=1c9a4f3e-0000-4000-8000-000000000001&presetName=Shared&instructions=Hi',
    '?preset=',
  ])('drops a preset link the page did not load: %s', (search) => {
    window.history.replaceState({}, '', `/en/dashboard/call${search}`);

    const { result } = renderHook(() => usePlaygroundState(), {
      wrapper: makeWrapper([savedCharacter]),
    });

    expect(result.current.pgState.customCharacters).toEqual([savedCharacter]);
    expect(result.current.pgState.selectedPresetId).toBeNull();
    expect(window.location.search).toBe('');
  });

  it('selectPreset writes only the preset ID to the URL, not the prompt', () => {
    window.history.replaceState({}, '', '/en/dashboard/call');
    const otherCharacter: Preset = {
      ...savedCharacter,
      id: '2d8b5e4f-0000-4000-8000-000000000002',
      instructions: 'You are Nova.',
      name: 'nova',
    };

    const { result } = renderHook(() => usePlaygroundState(), {
      wrapper: makeWrapper([savedCharacter, otherCharacter]),
    });
    act(() => result.current.selectPreset(savedCharacter.id));
    expect(result.current.pgState.instructions).toBe(
      savedCharacter.instructions,
    );
    act(() => result.current.selectPreset(otherCharacter.id));

    expect(result.current.pgState.selectedPresetId).toBe(otherCharacter.id);
    expect(window.location.search).toBe(`?preset=${otherCharacter.id}`);
  });
});
