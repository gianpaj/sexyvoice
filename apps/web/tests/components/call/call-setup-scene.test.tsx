// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { CallSetupProvider, useCallSetup } from '@/components/call/call-setup';
import { callScenes } from '@/lib/calls/scenes';

function wrapper({ children }: { children: ReactNode }) {
  return <CallSetupProvider language="en">{children}</CallSetupProvider>;
}

const firstScene = callScenes[0]; // bartender-after-closing
const secondScene = callScenes[1]; // forbidden-colleague

/** A setup with `sceneId` selected and its text replaced by `text`. */
function renderScene(sceneId: string | null, text?: string) {
  const { result } = renderHook(useCallSetup, { wrapper });
  act(() => result.current.selectScene(sceneId));
  if (text !== undefined) act(() => result.current.setSceneText(text));
  return result;
}

describe('call setup scenes', () => {
  describe('selectScene', () => {
    it('selects a scene and loads its default text', () => {
      const result = renderScene(firstScene.id);

      expect(result.current.sceneId).toBe(firstScene.id);
      expect(result.current.sceneText).toBe(firstScene.text);
    });

    it('loads the new scene text when switching between scenes with unmodified text', () => {
      const result = renderScene(firstScene.id);

      act(() => result.current.selectScene(secondScene.id));

      expect(result.current.sceneId).toBe(secondScene.id);
      expect(result.current.sceneText).toBe(secondScene.text);
    });

    it('keeps edited text when switching scenes', () => {
      const editedText = 'My custom scene instructions';
      const result = renderScene(firstScene.id, editedText);

      act(() => result.current.selectScene(secondScene.id));

      expect(result.current.sceneId).toBe(secondScene.id);
      expect(result.current.sceneText).toBe(editedText);
    });

    it('treats text that only gained surrounding spaces as unedited', () => {
      const result = renderScene(firstScene.id, `${firstScene.text}  `);

      act(() => result.current.selectScene(secondScene.id));

      expect(result.current.sceneText).toBe(secondScene.text);
    });

    it('clears unmodified text when no scene is selected', () => {
      const result = renderScene(firstScene.id);

      act(() => result.current.selectScene(null));

      expect(result.current.sceneId).toBeNull();
      expect(result.current.sceneText).toBe('');
    });

    it('keeps edited text when deselecting a scene', () => {
      const editedText = 'Custom instructions I wrote';
      const result = renderScene(firstScene.id, editedText);

      act(() => result.current.selectScene(null));

      expect(result.current.sceneId).toBeNull();
      expect(result.current.sceneText).toBe(editedText);
    });

    it('loads scene text when selecting a scene from no scene', () => {
      const result = renderScene(null);

      act(() => result.current.selectScene(firstScene.id));

      expect(result.current.sceneId).toBe(firstScene.id);
      expect(result.current.sceneText).toBe(firstScene.text);
    });
  });

  describe('setSceneText', () => {
    it('updates the scene text and keeps the scene', () => {
      const result = renderScene(firstScene.id);

      act(() => result.current.setSceneText('Updated scene instructions'));

      expect(result.current.sceneText).toBe('Updated scene instructions');
      expect(result.current.sceneId).toBe(firstScene.id);
    });
  });
});
