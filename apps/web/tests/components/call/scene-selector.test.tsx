// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { callScenes } from '@/lib/calls/scenes';

// ---------------------------------------------------------------------------
// Mutable refs for mock state
// ---------------------------------------------------------------------------
const mockConnectionState = { value: 'disconnected' };
const mockSelectScene = vi.fn();
const mockSetSceneText = vi.fn();
const mockSetupRef: {
  current: { sceneId: string | null; sceneText: string };
} = {
  current: { sceneId: null, sceneText: '' },
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/components/call/call-session', () => ({
  useCallSession: () => ({
    session: {
      phase: {
        name: mockConnectionState.value === 'connected' ? 'connected' : 'idle',
      },
    },
  }),
}));

vi.mock('lucide-react/dynamic', () => ({
  DynamicIcon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const labels: Record<string, string> = {
      sceneLabel: 'Scene',
      sceneNone: 'No scene',
      scenePlaceholder: 'Choose scene',
      sceneTextLabel: 'Scene text',
      sceneUpgradeRequired: 'Upgrade to use scenes',
    };
    return labels[key] ?? key;
  },
}));

vi.mock('@/components/call/call-setup', () => ({
  useCallSetup: () => ({
    ...mockSetupRef.current,
    selectScene: mockSelectScene,
    setSceneText: mockSetSceneText,
  }),
}));

// Radix Select shim: uses a React context so SelectItem can call onValueChange.
vi.mock('@/components/ui/select', () => {
  const React = require('react');
  // No type argument — require() returns untyped React, so we drop the generic.
  const ctx = React.createContext(
    {} as {
      onValueChange?: (v: string) => void;
      disabled?: boolean;
    },
  );

  return {
    Select: ({ children, onValueChange, disabled }: any) =>
      React.createElement(
        ctx.Provider,
        {
          value: {
            disabled,
            onValueChange: disabled ? undefined : onValueChange,
          },
        },
        React.createElement(
          'div',
          {
            'aria-disabled': disabled || undefined,
            'data-testid': 'scene-select',
          },
          children,
        ),
      ),
    SelectContent: ({ children }: any) =>
      React.createElement('div', { role: 'listbox' }, children),
    SelectItem: ({ children, value, disabled: itemDisabled }: any) => {
      const { onValueChange } = React.useContext(ctx);
      return React.createElement(
        'button',
        {
          'data-value': value,
          disabled: itemDisabled,
          onClick: () => !itemDisabled && onValueChange?.(value),
          role: 'option',
        },
        children,
      );
    },
    SelectTrigger: ({ children }: any) =>
      React.createElement('div', { role: 'combobox' }, children),
    SelectValue: ({ placeholder }: any) =>
      React.createElement('span', null, placeholder),
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
  mockSetupRef.current = { sceneId: null, sceneText: '' };
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
      expect(
        screen.getByRole('option', { name: /no scene/i }),
      ).toBeInTheDocument();
    });

    it('renders all 10 scene options', () => {
      render(<SceneSelector />);
      expect(screen.getAllByRole('option').length).toBe(callScenes.length + 1); // +1 for "No scene"
    });

    it('renders scene titles', () => {
      render(<SceneSelector />);
      expect(screen.getByText('Bartender After Closing')).toBeInTheDocument();
      expect(screen.getByText('Forbidden Colleague')).toBeInTheDocument();
    });
  });

  describe('free users', () => {
    it('all scene options are disabled for free users', () => {
      render(<SceneSelector isPaidUser={false} />);
      for (const scene of callScenes) {
        expect(
          screen.getByRole('option', { name: new RegExp(scene.title, 'i') }),
        ).toBeDisabled();
      }
    });

    it('"No scene" option is NOT disabled for free users', () => {
      render(<SceneSelector isPaidUser={false} />);
      expect(
        screen.getByRole('option', { name: /no scene/i }),
      ).not.toBeDisabled();
    });

    it('shows the upgrade message for free users', () => {
      render(<SceneSelector isPaidUser={false} />);
      expect(screen.getByText('Upgrade to use scenes')).toBeInTheDocument();
    });

    it('does NOT select a scene when a free user clicks a scene option', async () => {
      const user = userEvent.setup();
      render(<SceneSelector isPaidUser={false} />);
      await user.click(
        screen.getByRole('option', { name: /bartender after closing/i }),
      );
      expect(mockSelectScene).not.toHaveBeenCalled();
    });

    it('does NOT show the textarea for free users even with a scene selected', () => {
      mockSetupRef.current = {
        sceneId: 'bartender-after-closing',
        sceneText: callScenes[0].text,
      };
      render(<SceneSelector isPaidUser={false} />);
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });
  });

  describe('paid users', () => {
    beforeEach(() => {
      mockSetupRef.current = { sceneId: null, sceneText: '' };
    });

    it('all scene options are enabled for paid users', () => {
      render(<SceneSelector isPaidUser />);
      for (const scene of callScenes) {
        expect(
          screen.getByRole('option', { name: new RegExp(scene.title, 'i') }),
        ).not.toBeDisabled();
      }
    });

    it('does NOT show the upgrade message for paid users', () => {
      render(<SceneSelector isPaidUser />);
      expect(
        screen.queryByText('Upgrade to use scenes'),
      ).not.toBeInTheDocument();
    });

    it('selects a scene for a paid user', async () => {
      const user = userEvent.setup();
      render(<SceneSelector isPaidUser />);
      await user.click(
        screen.getByRole('option', { name: /bartender after closing/i }),
      );
      expect(mockSelectScene).toHaveBeenCalledWith('bartender-after-closing');
    });

    it('selects no scene when "No scene" is chosen', async () => {
      const user = userEvent.setup();
      mockSetupRef.current = {
        sceneId: 'bartender-after-closing',
        sceneText: callScenes[0].text,
      };
      render(<SceneSelector isPaidUser />);
      await user.click(screen.getByRole('option', { name: /no scene/i }));
      expect(mockSelectScene).toHaveBeenCalledWith(null);
    });

    it('does NOT show the textarea when no scene is selected', () => {
      render(<SceneSelector isPaidUser />);
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('shows the scene textarea when a scene is selected', () => {
      mockSetupRef.current = {
        sceneId: 'bartender-after-closing',
        sceneText: callScenes[0].text,
      };
      render(<SceneSelector isPaidUser />);
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('shows the "Scene text" label above the textarea', () => {
      mockSetupRef.current = {
        sceneId: 'bartender-after-closing',
        sceneText: callScenes[0].text,
      };
      render(<SceneSelector isPaidUser />);
      expect(screen.getByText('Scene text')).toBeInTheDocument();
    });

    it('textarea value reflects the scene text', () => {
      const customText = 'My custom scene text';
      mockSetupRef.current = {
        sceneId: 'bartender-after-closing',
        sceneText: customText,
      };
      render(<SceneSelector isPaidUser />);
      expect(screen.getByRole('textbox')).toHaveValue(customText);
    });

    it('updates the scene text when the textarea changes', async () => {
      const user = userEvent.setup();
      mockSetupRef.current = {
        sceneId: 'bartender-after-closing',
        sceneText: 'original',
      };
      render(<SceneSelector isPaidUser />);
      await user.type(screen.getByRole('textbox'), ' more');
      expect(mockSetSceneText).toHaveBeenCalled();
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

    it('does NOT select a scene when a paid user clicks a scene while connected', async () => {
      const user = userEvent.setup();
      render(<SceneSelector isPaidUser />);
      await user.click(
        screen.getByRole('option', { name: /bartender after closing/i }),
      );
      expect(mockSelectScene).not.toHaveBeenCalled();
    });

    it('textarea is disabled when connected', () => {
      mockSetupRef.current = {
        sceneId: 'bartender-after-closing',
        sceneText: callScenes[0].text,
      };
      render(<SceneSelector isPaidUser />);
      expect(screen.getByRole('textbox')).toBeDisabled();
    });
  });
});
