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

function makeWrapper(initialState?: Parameters<typeof PlaygroundStateProvider>[0]['initialState']) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <PlaygroundStateProvider initialState={initialState}>
        {children}
      </PlaygroundStateProvider>
    );
  };
}

const firstScene = callScenes[0]; // stranger-on-the-train
const secondScene = callScenes[1]; // bartender-after-closing

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
          type: 'SET_SELECTED_SCENE_ID',
          payload: firstScene.id,
        });
      });

      expect(result.current.pgState.selectedSceneId).toBe(firstScene.id);
      expect(result.current.pgState.sceneInstructions).toBe(firstScene.text);
    });

    it('loads the new scene text when switching between scenes with unmodified text', () => {
      const { result } = renderHook(() => usePlaygroundState(), {
        wrapper: makeWrapper({
          selectedSceneId: firstScene.id,
          sceneInstructions: firstScene.text, // unmodified
        }),
      });

      act(() => {
        result.current.dispatch({
          type: 'SET_SELECTED_SCENE_ID',
          payload: secondScene.id,
        });
      });

      expect(result.current.pgState.selectedSceneId).toBe(secondScene.id);
      expect(result.current.pgState.sceneInstructions).toBe(secondScene.text);
    });

    it('preserves user-edited text when switching scenes (Fix 3)', () => {
      const editedText = 'My custom scene instructions';
      const { result } = renderHook(() => usePlaygroundState(), {
        wrapper: makeWrapper({
          selectedSceneId: firstScene.id,
          sceneInstructions: editedText, // modified from default
        }),
      });

      act(() => {
        result.current.dispatch({
          type: 'SET_SELECTED_SCENE_ID',
          payload: secondScene.id,
        });
      });

      expect(result.current.pgState.selectedSceneId).toBe(secondScene.id);
      expect(result.current.pgState.sceneInstructions).toBe(editedText);
    });

    it('clears sceneInstructions when selecting null (no scene) with unmodified text', () => {
      const { result } = renderHook(() => usePlaygroundState(), {
        wrapper: makeWrapper({
          selectedSceneId: firstScene.id,
          sceneInstructions: firstScene.text, // unmodified
        }),
      });

      act(() => {
        result.current.dispatch({
          type: 'SET_SELECTED_SCENE_ID',
          payload: null,
        });
      });

      expect(result.current.pgState.selectedSceneId).toBeNull();
      expect(result.current.pgState.sceneInstructions).toBe('');
    });

    it('preserves user-edited text when deselecting a scene', () => {
      const editedText = 'Custom instructions I wrote';
      const { result } = renderHook(() => usePlaygroundState(), {
        wrapper: makeWrapper({
          selectedSceneId: firstScene.id,
          sceneInstructions: editedText,
        }),
      });

      act(() => {
        result.current.dispatch({
          type: 'SET_SELECTED_SCENE_ID',
          payload: null,
        });
      });

      expect(result.current.pgState.selectedSceneId).toBeNull();
      expect(result.current.pgState.sceneInstructions).toBe(editedText);
    });

    it('loads scene text when selecting a scene from empty (no prior scene)', () => {
      const { result } = renderHook(() => usePlaygroundState(), {
        wrapper: makeWrapper({
          selectedSceneId: null,
          sceneInstructions: '', // empty — "unmodified" from no-scene state
        }),
      });

      act(() => {
        result.current.dispatch({
          type: 'SET_SELECTED_SCENE_ID',
          payload: firstScene.id,
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
          selectedSceneId: firstScene.id,
          sceneInstructions: firstScene.text,
        }),
      });

      const newText = 'Updated scene instructions';
      act(() => {
        result.current.dispatch({
          type: 'SET_SCENE_INSTRUCTIONS',
          payload: newText,
        });
      });

      expect(result.current.pgState.sceneInstructions).toBe(newText);
    });

    it('does not change selectedSceneId when updating instructions', () => {
      const { result } = renderHook(() => usePlaygroundState(), {
        wrapper: makeWrapper({
          selectedSceneId: firstScene.id,
          sceneInstructions: firstScene.text,
        }),
      });

      act(() => {
        result.current.dispatch({
          type: 'SET_SCENE_INSTRUCTIONS',
          payload: 'new text',
        });
      });

      expect(result.current.pgState.selectedSceneId).toBe(firstScene.id);
    });
  });
});
