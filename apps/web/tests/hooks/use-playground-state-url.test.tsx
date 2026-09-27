// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { renderHook } from '@testing-library/react';
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

  it('selects a saved character from the URL without duplicating it', () => {
    const search = `?preset=${savedCharacter.id}&presetName=${savedCharacter.name}&sessionConfig.voice=Rex`;
    window.history.replaceState({}, '', `/en/dashboard/call${search}`);

    const { result } = renderHook(() => usePlaygroundState(), {
      wrapper: makeWrapper([savedCharacter]),
    });

    expect(result.current.pgState.customCharacters).toEqual([savedCharacter]);
    expect(result.current.pgState.selectedPresetId).toBe(savedCharacter.id);
    expect(result.current.pgState.instructions).toBe(
      savedCharacter.instructions,
    );
    expect(window.location.search).toBe(search);
  });

  it('adds a shared character from the URL and clears the URL', () => {
    const sharedId = '1c9a4f3e-0000-4000-8000-000000000001';
    window.history.replaceState(
      {},
      '',
      `/en/dashboard/call?preset=${sharedId}&presetName=Shared&instructions=Hi`,
    );

    const { result } = renderHook(() => usePlaygroundState(), {
      wrapper: makeWrapper([savedCharacter]),
    });

    expect(result.current.pgState.customCharacters.map(({ id }) => id)).toEqual(
      [savedCharacter.id, sharedId],
    );
    expect(result.current.pgState.selectedPresetId).toBe(sharedId);
    expect(window.location.search).toBe('');
  });
});
