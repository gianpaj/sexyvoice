// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// ---------------------------------------------------------------------------
// Shared mocks & fixtures — extracted to a dedicated utils file so this test
// file stays focused on behaviour assertions only.
// ---------------------------------------------------------------------------
import {
  createDefaultPgState,
  defaultPresetsFixture,
  makePreset,
  mockConnectionState,
  mockDispatch,
  mockPgStateRef,
  mockSelectPreset,
  mockToastInfo,
} from '@tests/utils/preset-selector-mocks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Component under test — imported AFTER all vi.mock() calls (which live in
// the mocks file and are hoisted there).
// ---------------------------------------------------------------------------
import { PresetSelector } from '@/components/call/preset-selector';
import type { PlaygroundState } from '@/data/playground-state';
import type { Preset } from '@/data/presets';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockOpenCustom = vi.fn();

beforeEach(() => {
  mockOpenCustom.mockClear();
  mockPgStateRef.current = createDefaultPgState();
  mockConnectionState.value = 'disconnected';

  // jsdom doesn't provide crypto.randomUUID — stub it so handleAddCharacter works
  if (!globalThis.crypto.randomUUID) {
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      value: () => '00000000-0000-4000-a000-000000000099',
    });
  }
  vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
    '00000000-0000-4000-a000-000000000099' as `${string}-${string}-${string}-${string}-${string}`,
  );

  vi.stubGlobal(
    'fetch',
    vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'DELETE') {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }

      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const name = body.name ?? 'Character 1';

      return new Response(
        JSON.stringify({
          id: '00000000-0000-4000-a000-000000000099',
          image: null,
          is_public: false,
          localized_descriptions: { en: 'A new custom character.' },
          name,
          prompt_id: 'ee000000-0000-4000-a000-000000000099',
          prompts: { localized_prompts: {}, prompt: '' },
          session_config: {
            maxOutputTokens: null,
            model: 'grok-voice-think-fast-1.0',
            temperature: 0.8,
            voice: 'Ara',
          },
          sort_order: 0,
          voice_id: '76071f55-b9d5-4852-a96e-dbadb7b93e9e',
          voices: { name: 'Ara', sample_url: null },
        }),
        { status: 201 },
      );
    }),
  );

  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PresetSelector', () => {
  // ---- Rendering ----
  describe('rendering', () => {
    it('renders the "Choose Character" heading', () => {
      render(<PresetSelector onCreateCharacter={mockOpenCustom} />);
      expect(screen.getByText('Choose Character')).toBeInTheDocument();
    });

    it('renders all three default character names when there are no custom characters', () => {
      render(<PresetSelector onCreateCharacter={mockOpenCustom} />);
      for (const preset of defaultPresetsFixture) {
        expect(screen.getByText(preset.name)).toBeInTheDocument();
      }
    });

    it('renders avatar images for default characters', () => {
      render(<PresetSelector onCreateCharacter={mockOpenCustom} />);
      for (const preset of defaultPresetsFixture) {
        const img = screen.getByAltText(preset.name);
        expect(img).toBeInTheDocument();
        expect(img).toHaveAttribute('src', `/characters/${preset.image}`);
      }
    });

    it('renders the bio card with the selected character description', () => {
      render(<PresetSelector onCreateCharacter={mockOpenCustom} />);
      expect(screen.getByText(/Ramona:/)).toBeInTheDocument();
      expect(screen.getByText(/Dominant businesswoman\./)).toBeInTheDocument();
    });

    it('does not render a bio card when no preset is selected', () => {
      mockPgStateRef.current = createDefaultPgState({
        selectedPresetId: null,
      });
      render(<PresetSelector onCreateCharacter={mockOpenCustom} />);
      expect(screen.queryByText(/Ramona:/)).not.toBeInTheDocument();
    });
  });

  // ---- Selection ----
  describe('character selection', () => {
    it('selects a character when it is clicked', async () => {
      const user = userEvent.setup();
      render(<PresetSelector onCreateCharacter={mockOpenCustom} />);
      await user.click(screen.getByRole('button', { name: /lily/i }));

      expect(mockSelectPreset).toHaveBeenCalledWith('lily');
    });

    it('marks the selected character with aria-pressed=true', () => {
      render(<PresetSelector onCreateCharacter={mockOpenCustom} />);
      expect(screen.getByRole('button', { name: /ramona/i })).toHaveAttribute(
        'data-selected',
        'true',
      );
      expect(screen.getByRole('button', { name: /lily/i })).toHaveAttribute(
        'data-selected',
        'false',
      );
    });
  });

  // ---- Connected state ----
  describe('when connected', () => {
    beforeEach(() => {
      mockConnectionState.value = 'connected';
    });

    it('disables all character buttons', () => {
      render(<PresetSelector onCreateCharacter={mockOpenCustom} />);
      const buttons = screen
        .getAllByRole('button')
        .filter((b) =>
          defaultPresetsFixture.some((p) => b.textContent?.includes(p.name)),
        );
      for (const button of buttons) {
        expect(button).toBeDisabled();
      }
    });

    it('does not dispatch when a character is clicked', async () => {
      const user = userEvent.setup();
      render(<PresetSelector onCreateCharacter={mockOpenCustom} />);
      await user.click(screen.getByRole('button', { name: /lily/i }));
      expect(mockDispatch).not.toHaveBeenCalled();
    });
  });

  // ---- Custom characters ----
  describe('custom characters', () => {
    it('renders custom characters alongside defaults', () => {
      mockPgStateRef.current = createDefaultPgState({
        customCharacters: [
          makePreset({
            id: 'custom-1',
            localizedDescriptions: { en: 'A custom character' },
            name: 'MyChar',
          }),
        ],
      });
      render(<PresetSelector onCreateCharacter={mockOpenCustom} />);
      // Default characters should be visible
      expect(screen.getByText('Ramona')).toBeInTheDocument();
      expect(screen.getByText('MyChar')).toBeInTheDocument();
    });

    beforeEach(() => {
      mockPgStateRef.current = createDefaultPgState({
        customCharacters: [
          makePreset({
            id: 'custom-1',
            localizedDescriptions: { en: 'Custom character 1' },
            name: 'AlphaChar',
          }),
          makePreset({
            id: 'custom-2',
            localizedDescriptions: { en: 'Custom character 2' },
            name: 'BetaChar',
          }),
        ],
      });
    });

    it('renders both default and custom characters', () => {
      render(<PresetSelector onCreateCharacter={mockOpenCustom} />);
      // All defaults
      for (const preset of defaultPresetsFixture) {
        expect(screen.getByText(preset.name)).toBeInTheDocument();
      }
      // Custom characters
      expect(screen.getByText('AlphaChar')).toBeInTheDocument();
      expect(screen.getByText('BetaChar')).toBeInTheDocument();
    });

    it('renders initials for custom characters without images', () => {
      render(<PresetSelector onCreateCharacter={mockOpenCustom} />);
      // AlphaChar → "A", BetaChar → "B"
      expect(screen.getByText('A')).toBeInTheDocument();
      expect(screen.getByText('B')).toBeInTheDocument();
    });

    it('shows a delete button only for the selected custom character', () => {
      mockPgStateRef.current = {
        ...(mockPgStateRef.current as PlaygroundState),
        selectedPresetId: 'custom-1',
      };
      render(<PresetSelector onCreateCharacter={mockOpenCustom} />);
      expect(screen.getByLabelText('Delete AlphaChar')).toBeInTheDocument();
      expect(
        screen.queryByLabelText('Delete BetaChar'),
      ).not.toBeInTheDocument();
    });

    it('does NOT show delete buttons for default characters', () => {
      render(<PresetSelector onCreateCharacter={mockOpenCustom} />);
      expect(screen.queryByLabelText('Delete Ramona')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Delete Lily')).not.toBeInTheDocument();
    });

    it('does NOT show delete buttons when connected', () => {
      mockConnectionState.value = 'connected';
      mockPgStateRef.current = {
        ...(mockPgStateRef.current as PlaygroundState),
        selectedPresetId: 'custom-1',
      };
      render(<PresetSelector onCreateCharacter={mockOpenCustom} />);
      expect(
        screen.queryByLabelText('Delete AlphaChar'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText('Delete BetaChar'),
      ).not.toBeInTheDocument();
    });

    it('can select a custom character', async () => {
      const user = userEvent.setup();
      render(<PresetSelector onCreateCharacter={mockOpenCustom} />);
      const alphaCharacterButton = screen
        .getAllByRole('button', { name: /alphachar/i })
        .find(
          (button) => !button.getAttribute('aria-label')?.startsWith('Delete'),
        );
      expect(alphaCharacterButton).toBeTruthy();
      await user.click(alphaCharacterButton as HTMLElement);

      expect(mockSelectPreset).toHaveBeenCalledWith('custom-1');
    });
  });

  // ---- Deletion flow ----
  describe('character deletion', () => {
    beforeEach(() => {
      mockPgStateRef.current = createDefaultPgState({
        customCharacters: [
          makePreset({
            id: 'custom-del',
            localizedDescriptions: { en: 'Will be deleted' },
            name: 'ToDelete',
          }),
        ],
        selectedPresetId: 'custom-del',
      });
    });

    it('opens the delete confirmation dialog when delete button is clicked', async () => {
      const user = userEvent.setup();
      render(<PresetSelector onCreateCharacter={mockOpenCustom} />);
      await user.click(screen.getByLabelText('Delete ToDelete'));

      const dialog = screen.getByRole('alertdialog');
      expect(
        within(dialog).getByText(/Delete "ToDelete"\?/),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByText(
          /This cannot be undone\. The character and its settings will be permanently removed\./,
        ),
      ).toBeInTheDocument();
    });

    it('dismisses the dialog when Cancel is clicked', async () => {
      const user = userEvent.setup();
      render(<PresetSelector onCreateCharacter={mockOpenCustom} />);
      await user.click(screen.getByLabelText('Delete ToDelete'));

      const dialog = screen.getByRole('alertdialog');
      await user.click(within(dialog).getByRole('button', { name: /cancel/i }));

      // Dialog should be gone
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('dispatches DELETE_CUSTOM_CHARACTER and shows toast when confirmed', async () => {
      const user = userEvent.setup();
      render(<PresetSelector onCreateCharacter={mockOpenCustom} />);
      await user.click(screen.getByLabelText('Delete ToDelete'));

      const dialog = screen.getByRole('alertdialog');
      await user.click(
        within(dialog).getByRole('button', { name: /^delete$/i }),
      );

      expect(mockDispatch).toHaveBeenCalledWith({
        payload: 'custom-del',
        type: 'DELETE_CUSTOM_CHARACTER',
      });
      expect(mockToastInfo).toHaveBeenCalledWith('Character removed');
    });

    it('selects the first default character when the currently selected custom character is deleted', async () => {
      const user = userEvent.setup();
      mockPgStateRef.current = createDefaultPgState({
        customCharacters: [
          makePreset({
            id: 'custom-del',
            localizedDescriptions: { en: 'Selected & deleted' },
            name: 'ToDelete',
          }),
        ],
        selectedPresetId: 'custom-del',
      });
      render(<PresetSelector onCreateCharacter={mockOpenCustom} />);
      await user.click(screen.getByLabelText('Delete ToDelete'));

      const dialog = screen.getByRole('alertdialog');
      await user.click(
        within(dialog).getByRole('button', { name: /^delete$/i }),
      );

      // Falls back to the first default character
      expect(mockSelectPreset).toHaveBeenCalledWith('ramona');
    });
  });

  // ---- Bio card ----
  describe('bio card', () => {
    it('shows the selected default character bio', () => {
      mockPgStateRef.current = createDefaultPgState({
        selectedPresetId: 'lily',
      });
      render(<PresetSelector onCreateCharacter={mockOpenCustom} />);
      expect(screen.getByText(/Lily:/)).toBeInTheDocument();
      expect(screen.getByText(/Shy student girl\./)).toBeInTheDocument();
    });

    it('shows the selected custom character bio with editable name and description', () => {
      mockPgStateRef.current = createDefaultPgState({
        customCharacters: [
          makePreset({
            id: 'custom-bio',
            localizedDescriptions: {
              en: 'A mysterious traveler from the desert.',
            },
            name: 'Zara',
          }),
        ],
        selectedPresetId: 'custom-bio',
      });
      render(<PresetSelector isPaidUser onCreateCharacter={mockOpenCustom} />);
      // For custom characters, name and description are separate editable elements
      // Zara appears twice: once in avatar label, once in bio card name button
      const zaraElements = screen.getAllByText('Zara');
      expect(zaraElements.length).toBeGreaterThanOrEqual(2);
      expect(
        screen.getByText(/A mysterious traveler from the desert\./),
      ).toBeInTheDocument();
    });

    it('dispatches selection when a different character is clicked', async () => {
      const user = userEvent.setup();
      render(<PresetSelector onCreateCharacter={mockOpenCustom} />);
      // Initially Ramona is selected
      expect(screen.getByText(/Ramona:/)).toBeInTheDocument();

      // Click Rafal
      await user.click(screen.getByRole('button', { name: /rafal/i }));
      expect(mockSelectPreset).toHaveBeenCalledWith('rafal');
    });
  });

  // ---- getInitials (tested indirectly) ----
  describe('initials rendering for imageless characters', () => {
    it('renders two-letter initials for a two-word name', () => {
      mockPgStateRef.current = createDefaultPgState({
        customCharacters: [
          makePreset({
            id: 'c1',
            localizedDescriptions: { en: 'Two words' },
            name: 'John Doe',
          }),
        ],
      });
      render(<PresetSelector onCreateCharacter={mockOpenCustom} />);
      expect(screen.getByText('JD')).toBeInTheDocument();
    });

    it('renders a single initial for a single-word name', () => {
      mockPgStateRef.current = createDefaultPgState({
        customCharacters: [
          makePreset({
            id: 'c1',
            localizedDescriptions: { en: 'One word' },
            name: 'Ava',
          }),
        ],
      });
      render(<PresetSelector onCreateCharacter={mockOpenCustom} />);
      expect(screen.getByText('A')).toBeInTheDocument();
    });

    it('limits initials to two characters for long names', () => {
      mockPgStateRef.current = createDefaultPgState({
        customCharacters: [
          makePreset({
            id: 'c1',
            localizedDescriptions: { en: 'Three words' },
            name: 'Anna Belle Catherine',
          }),
        ],
      });
      render(<PresetSelector onCreateCharacter={mockOpenCustom} />);
      expect(screen.getByText('AB')).toBeInTheDocument();
    });
  });

  // ---- Edge cases ----
  describe('edge cases', () => {
    it('renders correctly with no preset selected', () => {
      mockPgStateRef.current = createDefaultPgState({
        selectedPresetId: null,
      });
      render(<PresetSelector onCreateCharacter={mockOpenCustom} />);
      // Should not crash, heading still renders
      expect(screen.getByText('Choose Character')).toBeInTheDocument();
    });

    it('renders custom character with image', () => {
      mockPgStateRef.current = createDefaultPgState({
        customCharacters: [
          makePreset({
            id: 'custom-img',
            image: 'custom-avatar.webp',
            localizedDescriptions: { en: 'Has an image' },
            name: 'WithImage',
          }),
        ],
      });
      render(<PresetSelector onCreateCharacter={mockOpenCustom} />);
      const img = screen.getByAltText('WithImage');
      expect(img).toHaveAttribute('src', '/characters/custom-avatar.webp');
    });

    it('does not dispatch delete when dialog is cancelled', async () => {
      const user = userEvent.setup();
      mockPgStateRef.current = createDefaultPgState({
        customCharacters: [
          makePreset({
            id: 'c1',
            localizedDescriptions: { en: 'test' },
            name: 'TestChar',
          }),
        ],
        selectedPresetId: 'c1',
      });
      render(<PresetSelector onCreateCharacter={mockOpenCustom} />);

      // Open and cancel the dialog – then confirm that DELETE was not dispatched
      await user.click(screen.getByLabelText('Delete TestChar'));
      const dialog = screen.getByRole('alertdialog');
      await user.click(within(dialog).getByRole('button', { name: /cancel/i }));

      const deleteCalls = mockDispatch.mock.calls.filter(
        (call: any[]) => call[0]?.type === 'DELETE_CUSTOM_CHARACTER',
      );
      expect(deleteCalls).toHaveLength(0);
    });
  });

  // ---- Add Character button (premium gating) ----
  describe('add character button', () => {
    it('renders the "Add" button', () => {
      mockPgStateRef.current = createDefaultPgState({
        customCharacters: [
          makePreset({
            id: 'c1',
            localizedDescriptions: { en: 'test' },
            name: 'Existing',
          }),
        ],
      });
      render(<PresetSelector onCreateCharacter={mockOpenCustom} />);
      expect(
        screen.getByRole('button', { name: /add custom character/i }),
      ).toBeInTheDocument();
    });

    it('shows a premium badge (Sparkles icon) for free users', () => {
      render(<PresetSelector onCreateCharacter={mockOpenCustom} />);
      expect(screen.getByLabelText('Premium feature')).toBeInTheDocument();
    });

    it('is enabled for paid users', () => {
      render(<PresetSelector isPaidUser onCreateCharacter={mockOpenCustom} />);
      expect(
        screen.getByRole('button', { name: /add custom character/i }),
      ).toBeEnabled();
    });

    it('does not show a premium badge for paid users', () => {
      render(<PresetSelector isPaidUser onCreateCharacter={mockOpenCustom} />);
      expect(
        screen.queryByLabelText('Premium feature'),
      ).not.toBeInTheDocument();
    });

    it('opens the inline Custom setup when a paid user adds a character', async () => {
      const user = userEvent.setup();
      render(<PresetSelector isPaidUser onCreateCharacter={mockOpenCustom} />);
      await user.click(
        screen.getByRole('button', { name: /add custom character/i }),
      );
      expect(mockOpenCustom).toHaveBeenCalledOnce();
    });

    it('does NOT dispatch when clicked by a free user', async () => {
      const user = userEvent.setup();
      render(<PresetSelector onCreateCharacter={mockOpenCustom} />);
      await user.click(
        screen.getByRole('button', { name: /add custom character/i }),
      );

      const saveCalls = mockDispatch.mock.calls.filter(
        (call: any[]) => call[0]?.type === 'SAVE_CUSTOM_CHARACTER',
      );
      expect(saveCalls).toHaveLength(0);
    });

    it('is disabled when connected (even for paid users)', () => {
      mockConnectionState.value = 'connected';
      render(<PresetSelector isPaidUser onCreateCharacter={mockOpenCustom} />);
      expect(
        screen.getByRole('button', { name: /add custom character/i }),
      ).toBeDisabled();
    });

    it('is hidden when the user has 10 custom characters (max limit)', () => {
      const maxCustom: Preset[] = Array.from({ length: 10 }, (_, i) =>
        makePreset({
          id: `c-${i}`,
          localizedDescriptions: { en: `desc ${i}` },
          name: `Char${i}`,
        }),
      );
      mockPgStateRef.current = createDefaultPgState({
        customCharacters: maxCustom,
      });
      render(<PresetSelector isPaidUser onCreateCharacter={mockOpenCustom} />);
      expect(
        screen.queryByRole('button', { name: /add custom character/i }),
      ).not.toBeInTheDocument();
    });

    it('shows the premium tooltip text for free users on hover', async () => {
      const user = userEvent.setup();
      render(<PresetSelector onCreateCharacter={mockOpenCustom} />);
      // The tooltip trigger wraps the button in a <span> — hover it to open
      const trigger = screen
        .getByRole('button', { name: /add custom character/i })
        .closest('span[tabindex]');
      expect(trigger).toBeTruthy();
      await user.hover(trigger!);
      // Radix renders the tooltip text both visually and in a hidden
      // role="tooltip" element for accessibility, so expect ≥ 1 match.
      const matches = await screen.findAllByText(
        'Upgrade to create custom characters',
      );
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });
});
