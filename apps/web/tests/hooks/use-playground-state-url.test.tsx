// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { defaultSessionConfig } from '@/data/default-config';
import type { Preset } from '@/data/presets';
import {
  PlaygroundStateProvider,
  usePlaygroundState,
} from '@/hooks/use-playground-state';

const publicCharacter: Preset = {
  id: 'ea5b2c17-0000-4000-8000-0000000000a1',
  instructions: 'You are Ramona.',
  isPublic: true,
  name: 'Ramona',
  sessionConfig: { ...defaultSessionConfig, voice: 'Eve' },
};

const defaultPresets = [publicCharacter];

const savedCharacter: Preset = {
  id: '9f521791-9ee4-43d9-8345-a9f9e5ad7632',
  instructions: 'You are Luna.',
  name: 'luna2',
  sessionConfig: { ...defaultSessionConfig, voice: 'Rex' },
};

// Mirrors the wiring in app/[lang]/(dashboard)/dashboard/call/layout.tsx, which
// seeds the first public character as the initial selection.
function makeWrapper(initialCustomCharacters: Preset[]) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <PlaygroundStateProvider
        defaultPresets={defaultPresets}
        initialCustomCharacters={initialCustomCharacters}
        initialState={{ selectedPresetId: publicCharacter.id }}
      >
        {children}
      </PlaygroundStateProvider>
    );
  };
}

describe('usePlaygroundState — preset URL', () => {
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
    expect(result.current.pgState.selectedPresetId).toBe(publicCharacter.id);
    expect(window.location.search).toBe('');
  });

  it('keeps query params the call page does not own', () => {
    window.history.replaceState(
      {},
      '',
      `/en/dashboard/call?utm_source=newsletter&preset=${savedCharacter.id}&instructions=Old+prompt`,
    );

    const { result } = renderHook(() => usePlaygroundState(), {
      wrapper: makeWrapper([savedCharacter]),
    });

    expect(window.location.search).toBe(
      `?utm_source=newsletter&preset=${savedCharacter.id}`,
    );

    act(() => result.current.selectPreset(publicCharacter.id));

    expect(window.location.search).toBe(
      `?utm_source=newsletter&preset=${publicCharacter.id}`,
    );
  });

  it("keeps the router's history state when rewriting an old link on load", () => {
    window.history.replaceState(
      { __NA: true },
      '',
      `/en/dashboard/call?preset=${savedCharacter.id}&instructions=Old+prompt`,
    );

    renderHook(() => usePlaygroundState(), {
      wrapper: makeWrapper([savedCharacter]),
    });

    expect(window.history.state).toEqual({ __NA: true });
    expect(window.location.search).toBe(`?preset=${savedCharacter.id}`);
  });

  it('passes a null state on selection so Next can sync its router', () => {
    window.history.replaceState({ __NA: true }, '', '/en/dashboard/call');
    const { result } = renderHook(() => usePlaygroundState(), {
      wrapper: makeWrapper([savedCharacter]),
    });
    const replaceState = vi.spyOn(window.history, 'replaceState');

    act(() => result.current.selectPreset(publicCharacter.id));

    expect(replaceState).toHaveBeenLastCalledWith(
      null,
      '',
      `/en/dashboard/call?preset=${publicCharacter.id}`,
    );
    replaceState.mockRestore();
  });

  it('selectPreset writes only the preset ID to the URL, not the prompt', () => {
    window.history.replaceState({}, '', '/en/dashboard/call');

    const { result } = renderHook(() => usePlaygroundState(), {
      wrapper: makeWrapper([savedCharacter]),
    });
    act(() => result.current.selectPreset(savedCharacter.id));

    expect(result.current.pgState.selectedPresetId).toBe(savedCharacter.id);
    expect(result.current.pgState.instructions).toBe(
      savedCharacter.instructions,
    );
    expect(window.location.search).toBe(`?preset=${savedCharacter.id}`);
  });

  it('keeps unsaved instructions when the current character is re-selected', () => {
    window.history.replaceState({}, '', '/en/dashboard/call');

    const { result } = renderHook(() => usePlaygroundState(), {
      wrapper: makeWrapper([savedCharacter]),
    });
    act(() => result.current.selectPreset(savedCharacter.id));
    act(() =>
      result.current.dispatch({
        payload: 'Edited but not saved.',
        type: 'SET_INSTRUCTIONS',
      }),
    );
    act(() => result.current.selectPreset(savedCharacter.id));

    expect(result.current.pgState.instructions).toBe('Edited but not saved.');
    expect(window.location.search).toBe(`?preset=${savedCharacter.id}`);
  });
});
