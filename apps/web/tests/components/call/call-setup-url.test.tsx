// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CallSetupProvider, useCallSetup } from '@/components/call/call-setup';
import {
  type Character,
  characterPrompt,
  DEFAULT_SESSION_CONFIG,
} from '@/lib/calls/characters';
import { makeCharacter } from '../../utils/call-test-utils';

const publicCharacter = makeCharacter({
  id: 'ea5b2c17-0000-4000-8000-0000000000a1',
  isPublic: true,
  name: 'Ramona',
  prompt: 'You are Ramona.',
  sessionConfig: { ...DEFAULT_SESSION_CONFIG, voice: 'Eve' },
});

const predefinedCharacters = [publicCharacter];

const savedCharacter = makeCharacter({
  id: '9f521791-9ee4-43d9-8345-a9f9e5ad7632',
  name: 'luna2',
  prompt: 'You are Luna.',
  sessionConfig: { ...DEFAULT_SESSION_CONFIG, voice: 'Rex' },
});

// Mirrors the wiring in app/[lang]/(dashboard)/dashboard/call/page.tsx: the
// page resolves a `?preset=` link to a loaded character.
function makeWrapper(
  customCharacters: Character[],
  linkedCharacterId: string | null = null,
) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <CallSetupProvider
        customCharacters={customCharacters}
        language="en"
        linkedCharacterId={linkedCharacterId}
        predefinedCharacters={predefinedCharacters}
      >
        {children}
      </CallSetupProvider>
    );
  };
}

/** The prompt a call with the selected character would use. */
function selectedPrompt(context: ReturnType<typeof useCallSetup>) {
  const { language, selected } = context;
  return selected && characterPrompt(selected, language);
}

describe('call setup URL', () => {
  it.each(['create', 'edit', 'duplicate'])(
    'preserves saved German prompts on %s',
    (operation) => {
      window.history.replaceState({}, '', '/de/dashboard/call');
      const { result } = renderHook(useCallSetup, {
        wrapper: makeWrapper(operation === 'edit' ? [savedCharacter] : []),
      });
      act(() => result.current.setLanguage('de'));
      const response = {
        ...savedCharacter,
        localizedPrompts: { en: 'You are Luna.', de: 'Du bist Luna.' },
      };
      act(() => result.current.saveCharacter(response));
      act(() => result.current.selectCharacter(response.id));

      expect(result.current.customCharacters).toEqual([response]);
      expect(selectedPrompt(result.current)).toBe('Du bist Luna.');
    },
  );

  it('selects a saved character from an old link without duplicating it', () => {
    const search = `?preset=${savedCharacter.id}&presetName=${savedCharacter.name}&instructions=Old+prompt&sessionConfig.voice=Rex`;
    window.history.replaceState({}, '', `/en/dashboard/call${search}`);

    const { result } = renderHook(useCallSetup, {
      wrapper: makeWrapper([savedCharacter], savedCharacter.id),
    });

    expect(result.current.customCharacters).toEqual([savedCharacter]);
    expect(result.current.selected?.id).toBe(savedCharacter.id);
    expect(selectedPrompt(result.current)).toBe(savedCharacter.prompt);
    expect(window.location.search).toBe(`?preset=${savedCharacter.id}`);
  });

  it.each([
    '?preset=1c9a4f3e-0000-4000-8000-000000000001&presetName=Shared&instructions=Hi',
    '?preset=',
  ])('drops a preset link the page did not load: %s', (search) => {
    window.history.replaceState({}, '', `/en/dashboard/call${search}`);

    const { result } = renderHook(useCallSetup, {
      wrapper: makeWrapper([savedCharacter]),
    });

    expect(result.current.customCharacters).toEqual([savedCharacter]);
    expect(result.current.selected?.id).toBe(publicCharacter.id);
    expect(window.location.search).toBe('');
  });

  it('keeps query params the call page does not own', () => {
    window.history.replaceState(
      {},
      '',
      `/en/dashboard/call?utm_source=newsletter&preset=${savedCharacter.id}&instructions=Old+prompt`,
    );

    const { result } = renderHook(useCallSetup, {
      wrapper: makeWrapper([savedCharacter], savedCharacter.id),
    });

    expect(window.location.search).toBe(
      `?utm_source=newsletter&preset=${savedCharacter.id}`,
    );

    act(() => result.current.selectCharacter(publicCharacter.id));

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

    renderHook(useCallSetup, {
      wrapper: makeWrapper([savedCharacter], savedCharacter.id),
    });

    expect(window.history.state).toEqual({ __NA: true });
    expect(window.location.search).toBe(`?preset=${savedCharacter.id}`);
  });

  it('passes a null state on selection so Next can sync its router', () => {
    window.history.replaceState({ __NA: true }, '', '/en/dashboard/call');
    const { result } = renderHook(useCallSetup, {
      wrapper: makeWrapper([savedCharacter]),
    });
    const replaceState = vi.spyOn(window.history, 'replaceState');

    act(() => result.current.selectCharacter(publicCharacter.id));

    expect(replaceState).toHaveBeenLastCalledWith(
      null,
      '',
      `/en/dashboard/call?preset=${publicCharacter.id}`,
    );
    replaceState.mockRestore();
  });

  it('selecting writes only the character ID to the URL, not the prompt', () => {
    window.history.replaceState({}, '', '/en/dashboard/call');

    const { result } = renderHook(useCallSetup, {
      wrapper: makeWrapper([savedCharacter]),
    });
    act(() => result.current.selectCharacter(savedCharacter.id));

    expect(result.current.selected?.id).toBe(savedCharacter.id);
    expect(selectedPrompt(result.current)).toBe(savedCharacter.prompt);
    expect(window.location.search).toBe(`?preset=${savedCharacter.id}`);
  });

  it('reloads a saved character when it is selected again', () => {
    window.history.replaceState({}, '', '/en/dashboard/call');

    const { result } = renderHook(useCallSetup, {
      wrapper: makeWrapper([savedCharacter]),
    });
    act(() => result.current.selectCharacter(savedCharacter.id));
    act(() =>
      result.current.saveCharacter({
        ...savedCharacter,
        prompt: 'You are Luna, updated.',
      }),
    );
    act(() => result.current.selectCharacter(savedCharacter.id));

    expect(selectedPrompt(result.current)).toBe('You are Luna, updated.');
    expect(window.location.search).toBe(`?preset=${savedCharacter.id}`);
  });
});
