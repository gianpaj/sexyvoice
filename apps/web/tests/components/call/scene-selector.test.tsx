// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { callScenes } from '@/data/call-scenes';
import type { PlaygroundState } from '@/data/playground-state';

// ---------------------------------------------------------------------------
// Mutable refs for mock state
// ---------------------------------------------------------------------------
const mockConnectionState = { value: 'disconnected' };
const mockDispatch = vi.fn();
const mockPgStateRef: { current: Partial<PlaygroundState> } = {
  current: { selectedSceneId: null, sceneInstructions: '' },
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@livekit/components-react', () => ({
  useConnectionState: () => mockConnectionState.value,
}));

vi.mock('livekit-client', () => ({
  ConnectionState: { Connected: 'connected', Disconnected: 'disconnected' },
}));

vi.mock('lucide-react/dynamic', () => ({
  DynamicIcon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const labels: Record<string, string> = {
      sceneLabel: 'Scene',
      scenePlaceholder: 'Choose scene',
      sceneNone: 'No scene',
      sceneUpgradeRequired: 'Upgrade to use scenes',
      sceneTextLabel: 'Scene text',
    };
    return labels[key] ?? key;
  },
}));

vi.mock('@/hooks/use-connection', () => ({
  useConnection: () => ({}),
}));

vi.mock('@/hooks/use-playground-state', () => ({
  usePlaygroundState: () => ({
    pgState: mockPgStateRef.current,
    dispatch: mockDispatch,
  }),
}));

// Radix Select shim: uses a React context so SelectItem can call onValueChange.
vi.mock('@/components/ui/select', () => {
  const React = require('react');
  // No type argument — require() returns untyped React, so we drop the generic.
  const ctx = React.createContext({} as {
    onValueChange?: (v: string) => void;
    disabled?: boolean;
  });

  return {
    Select: ({ children, onValueChange, disabled }: any) =>
      React.createElement(
        ctx.Provider,
        { value: { onValueChange: disabled ? undefined : onValueChange, disabled } },
        React.createElement('div', { 'data-testid': 'scene-select', 'aria-disabled': disabled || undefined }, children),
      ),
    SelectTrigger: ({ children }: any) =>
      React.createElement('div', { role: 'combobox' }, children),
    SelectValue: ({ placeholder }: any) =>
      React.createElement('span', null, placeholder),
    SelectContent: ({ children }: any) =>
      React.createElement('div', { role: 'listbox' }, children),
    SelectItem: ({ children, value, disabled: itemDisabled }: any) => {
      const { onValueChange } = React.useContext(ctx);
      return React.createElement(
        'button',
        {
          role: 'option',
          disabled: itemDisabled,
          'data-value': value,
          onClick: () => !itemDisabled && onValueChange?.(value),
        },
        children,
      );
    },
  };
});

// ---------------------------------------------------------------------------
// Component under test — imported AFTER vi.mock() calls
// ---------------------------------------------------------------------------
import { SceneSelector } from '@/components/call/scene-selector';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockConnectionState.value = 'disconnected';
  mockPgStateRef.current = { selectedSceneId: null, sceneInstructions: '' };
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SceneSelector', () => {
  describe('rendering', () => {
    it('renders the "Scene" label', () => {
      render(<SceneSelector />);
      expect(screen.getByText('Scene')).toBeInTheDocument();
    });

    it('renders the "No scene" option', () => {
      render(<SceneSelector />);
      expect(screen.getByRole('option', { name: /no scene/i })).toBeInTheDocument();
    });

    it('renders all 10 scene options', () => {
      render(<SceneSelector />);
      expect(screen.getAllByRole('option').length).toBe(callScenes.length + 1); // +1 for "No scene"
    });

    it('renders scene titles', () => {
      render(<SceneSelector />);
      expect(screen.getByText('Stranger on the Train')).toBeInTheDocument();
      expect(screen.getByText('Bartender After Closing')).toBeInTheDocument();
    });
  });

  describe('free users', () => {
    it('all scene options are disabled for free users', () => {
      render(<SceneSelector isPaidUser={false} />);
      for (const scene of callScenes) {
        expect(screen.getByRole('option', { name: new RegExp(scene.title, 'i') })).toBeDisabled();
      }
    });

    it('"No scene" option is NOT disabled for free users', () => {
      render(<SceneSelector isPaidUser={false} />);
      expect(screen.getByRole('option', { name: /no scene/i })).not.toBeDisabled();
    });

    it('shows the upgrade message for free users', () => {
      render(<SceneSelector isPaidUser={false} />);
      expect(screen.getByText('Upgrade to use scenes')).toBeInTheDocument();
    });

    it('does NOT dispatch when a free user clicks a scene option', async () => {
      const user = userEvent.setup();
      render(<SceneSelector isPaidUser={false} />);
      await user.click(screen.getByRole('option', { name: /stranger on the train/i }));
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it('does NOT show the textarea for free users even with a scene selected', () => {
      mockPgStateRef.current = {
        selectedSceneId: 'stranger-on-the-train',
        sceneInstructions: callScenes[0].text,
      };
      render(<SceneSelector isPaidUser={false} />);
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });
  });

  describe('paid users', () => {
    beforeEach(() => {
      mockPgStateRef.current = { selectedSceneId: null, sceneInstructions: '' };
    });

    it('all scene options are enabled for paid users', () => {
      render(<SceneSelector isPaidUser />);
      for (const scene of callScenes) {
        expect(screen.getByRole('option', { name: new RegExp(scene.title, 'i') })).not.toBeDisabled();
      }
    });

    it('does NOT show the upgrade message for paid users', () => {
      render(<SceneSelector isPaidUser />);
      expect(screen.queryByText('Upgrade to use scenes')).not.toBeInTheDocument();
    });

    it('dispatches SET_SELECTED_SCENE_ID when a paid user selects a scene', async () => {
      const user = userEvent.setup();
      render(<SceneSelector isPaidUser />);
      await user.click(screen.getByRole('option', { name: /stranger on the train/i }));
      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'SET_SELECTED_SCENE_ID',
        payload: 'stranger-on-the-train',
      });
    });

    it('dispatches SET_SELECTED_SCENE_ID with null when "No scene" is selected', async () => {
      const user = userEvent.setup();
      mockPgStateRef.current = {
        selectedSceneId: 'stranger-on-the-train',
        sceneInstructions: callScenes[0].text,
      };
      render(<SceneSelector isPaidUser />);
      await user.click(screen.getByRole('option', { name: /no scene/i }));
      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'SET_SELECTED_SCENE_ID',
        payload: null,
      });
    });

    it('does NOT show the textarea when no scene is selected', () => {
      render(<SceneSelector isPaidUser />);
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('shows the scene textarea when a scene is selected', () => {
      mockPgStateRef.current = {
        selectedSceneId: 'stranger-on-the-train',
        sceneInstructions: callScenes[0].text,
      };
      render(<SceneSelector isPaidUser />);
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('shows the "Scene text" label above the textarea', () => {
      mockPgStateRef.current = {
        selectedSceneId: 'stranger-on-the-train',
        sceneInstructions: callScenes[0].text,
      };
      render(<SceneSelector isPaidUser />);
      expect(screen.getByText('Scene text')).toBeInTheDocument();
    });

    it('textarea value reflects pgState.sceneInstructions', () => {
      const customText = 'My custom scene text';
      mockPgStateRef.current = {
        selectedSceneId: 'stranger-on-the-train',
        sceneInstructions: customText,
      };
      render(<SceneSelector isPaidUser />);
      expect(screen.getByRole('textbox')).toHaveValue(customText);
    });

    it('dispatches SET_SCENE_INSTRUCTIONS when the textarea changes', async () => {
      const user = userEvent.setup();
      mockPgStateRef.current = {
        selectedSceneId: 'stranger-on-the-train',
        sceneInstructions: 'original',
      };
      render(<SceneSelector isPaidUser />);
      await user.type(screen.getByRole('textbox'), ' more');
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'SET_SCENE_INSTRUCTIONS' }),
      );
    });
  });

  describe('connected state', () => {
    beforeEach(() => {
      mockConnectionState.value = 'connected';
    });

    it('renders the select as aria-disabled when connected', () => {
      render(<SceneSelector isPaidUser />);
      const select = screen.getByTestId('scene-select');
      expect(select).toHaveAttribute('aria-disabled');
    });

    it('does NOT dispatch when a paid user clicks a scene while connected', async () => {
      const user = userEvent.setup();
      render(<SceneSelector isPaidUser />);
      await user.click(screen.getByRole('option', { name: /stranger on the train/i }));
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it('textarea is disabled when connected', () => {
      mockPgStateRef.current = {
        selectedSceneId: 'stranger-on-the-train',
        sceneInstructions: callScenes[0].text,
      };
      render(<SceneSelector isPaidUser />);
      expect(screen.getByRole('textbox')).toBeDisabled();
    });
  });
});
