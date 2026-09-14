// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import { callScenes } from '@/data/call-scenes';
import {
  PlaygroundStateProvider,
  usePlaygroundState,
} from '@/hooks/use-playground-state';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWrapper(
  initialState?: Parameters<typeof PlaygroundStateProvider>[0]['initialState'],
) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <PlaygroundStateProvider initialState={initialState}>
        {children}
      </PlaygroundStateProvider>
    );
  };
}

const firstScene = callScenes[0]; // bartender-after-closing
const secondScene = callScenes[1]; // forbidden-colleague

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePlaygroundState — scene actions', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('SET_SELECTED_SCENE_ID', () => {
    it('sets selectedSceneId and loads the scene default text', () => {
      const { result } = renderHook(() => usePlaygroundState(), {
        wrapper: makeWrapper(),
      });

      act(() => {
        result.current.dispatch({
          payload: firstScene.id,
          type: 'SET_SELECTED_SCENE_ID',
        });
      });

      expect(result.current.pgState.selectedSceneId).toBe(firstScene.id);
      expect(result.current.pgState.sceneInstructions).toBe(firstScene.text);
    });

    it('loads the new scene text when switching between scenes with unmodified text', () => {
      const { result } = renderHook(() => usePlaygroundState(), {
        wrapper: makeWrapper({
          sceneInstructions: firstScene.text, // unmodified
          selectedSceneId: firstScene.id,
        }),
      });

      act(() => {
        result.current.dispatch({
          payload: secondScene.id,
          type: 'SET_SELECTED_SCENE_ID',
        });
      });

      expect(result.current.pgState.selectedSceneId).toBe(secondScene.id);
      expect(result.current.pgState.sceneInstructions).toBe(secondScene.text);
    });

    it('preserves user-edited text when switching scenes (Fix 3)', () => {
      const editedText = 'My custom scene instructions';
      const { result } = renderHook(() => usePlaygroundState(), {
        wrapper: makeWrapper({
          sceneInstructions: editedText, // modified from default
          selectedSceneId: firstScene.id,
        }),
      });

      act(() => {
        result.current.dispatch({
          payload: secondScene.id,
          type: 'SET_SELECTED_SCENE_ID',
        });
      });

      expect(result.current.pgState.selectedSceneId).toBe(secondScene.id);
      expect(result.current.pgState.sceneInstructions).toBe(editedText);
    });

    it('clears sceneInstructions when selecting null (no scene) with unmodified text', () => {
      const { result } = renderHook(() => usePlaygroundState(), {
        wrapper: makeWrapper({
          sceneInstructions: firstScene.text, // unmodified
          selectedSceneId: firstScene.id,
        }),
      });

      act(() => {
        result.current.dispatch({
          payload: null,
          type: 'SET_SELECTED_SCENE_ID',
        });
      });

      expect(result.current.pgState.selectedSceneId).toBeNull();
      expect(result.current.pgState.sceneInstructions).toBe('');
    });

    it('preserves user-edited text when deselecting a scene', () => {
      const editedText = 'Custom instructions I wrote';
      const { result } = renderHook(() => usePlaygroundState(), {
        wrapper: makeWrapper({
          sceneInstructions: editedText,
          selectedSceneId: firstScene.id,
        }),
      });

      act(() => {
        result.current.dispatch({
          payload: null,
          type: 'SET_SELECTED_SCENE_ID',
        });
      });

      expect(result.current.pgState.selectedSceneId).toBeNull();
      expect(result.current.pgState.sceneInstructions).toBe(editedText);
    });

    it('loads scene text when selecting a scene from empty (no prior scene)', () => {
      const { result } = renderHook(() => usePlaygroundState(), {
        wrapper: makeWrapper({
          sceneInstructions: '', // empty — "unmodified" from no-scene state
          selectedSceneId: null,
        }),
      });

      act(() => {
        result.current.dispatch({
          payload: firstScene.id,
          type: 'SET_SELECTED_SCENE_ID',
        });
      });

      expect(result.current.pgState.selectedSceneId).toBe(firstScene.id);
      expect(result.current.pgState.sceneInstructions).toBe(firstScene.text);
    });
  });

  describe('SET_SCENE_INSTRUCTIONS', () => {
    it('updates sceneInstructions', () => {
      const { result } = renderHook(() => usePlaygroundState(), {
        wrapper: makeWrapper({
          sceneInstructions: firstScene.text,
          selectedSceneId: firstScene.id,
        }),
      });

      const newText = 'Updated scene instructions';
      act(() => {
        result.current.dispatch({
          payload: newText,
          type: 'SET_SCENE_INSTRUCTIONS',
        });
      });

      expect(result.current.pgState.sceneInstructions).toBe(newText);
    });

    it('does not change selectedSceneId when updating instructions', () => {
      const { result } = renderHook(() => usePlaygroundState(), {
        wrapper: makeWrapper({
          sceneInstructions: firstScene.text,
          selectedSceneId: firstScene.id,
        }),
      });

      act(() => {
        result.current.dispatch({
          payload: 'new text',
          type: 'SET_SCENE_INSTRUCTIONS',
        });
      });

      expect(result.current.pgState.selectedSceneId).toBe(firstScene.id);
    });
  });
});
