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
  mockEncodeToUrlParams,
  mockPgStateRef,
  mockSearchParams,
  mockToastInfo,
} from '@tests/utils/preset-selector-mocks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Component under test — imported AFTER all vi.mock() calls (which live in
// the mocks file and are hoisted there).
// ---------------------------------------------------------------------------
import { PresetSelector } from '@/components/call/preset-selector';
import type { Preset } from '@/data/presets';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let replaceStateSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockPgStateRef.current = createDefaultPgState();
  mockConnectionState.value = 'disconnected';
  mockSearchParams.value = new URLSearchParams();
  replaceStateSpy = vi
    .spyOn(window.history, 'replaceState')
    .mockImplementation(() => undefined);

  // jsdom doesn't provide crypto.randomUUID — stub it so handleAddCharacter works
  if (!globalThis.crypto.randomUUID) {
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      value: () => '00000000-0000-4000-a000-000000000099',
      configurable: true,
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
          name,
          localized_descriptions: { en: 'A new custom character.' },
          image: null,
          session_config: {
            model: 'grok-4-1-fast-non-reasoning',
            voice: 'Ara',
            temperature: 0.8,
            maxOutputTokens: null,
            grokImageEnabled: false,
          },
          sort_order: 0,
          is_public: false,
          voice_id: '76071f55-b9d5-4852-a96e-dbadb7b93e9e',
          voices: { name: 'Ara', sample_url: null },
          prompt_id: 'ee000000-0000-4000-a000-000000000099',
          prompts: { prompt: '', localized_prompts: {} },
        }),
        { status: 201 },
      );
    }),
  );

  vi.clearAllMocks();
});

afterEach(() => {
  replaceStateSpy.mockRestore();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PresetSelector', () => {
  // ---- Rendering ----
  describe('rendering', () => {
    it('renders the "Choose Character" heading', () => {
      render(<PresetSelector />);
      expect(screen.getByText('Choose Character')).toBeInTheDocument();
    });

    it('renders all four default character names when there are no custom characters', () => {
      render(<PresetSelector />);
      for (const preset of defaultPresetsFixture) {
        expect(screen.getByText(preset.name)).toBeInTheDocument();
      }
    });

    it('renders avatar images for default characters', () => {
      render(<PresetSelector />);
      for (const preset of defaultPresetsFixture) {
        const img = screen.getByAltText(preset.name);
        expect(img).toBeInTheDocument();
        expect(img).toHaveAttribute('src', `/characters/${preset.image}`);
      }
    });

    it('renders the bio card with the selected character description', () => {
      render(<PresetSelector />);
      expect(screen.getByText(/Ramona:/)).toBeInTheDocument();
      expect(screen.getByText(/Dominant businesswoman\./)).toBeInTheDocument();
    });

    it('does not render a bio card when no preset is selected', () => {
      mockPgStateRef.current = createDefaultPgState({
        selectedPresetId: null,
      });
      render(<PresetSelector />);
      expect(screen.queryByText(/Ramona:/)).not.toBeInTheDocument();
    });
  });

  // ---- Selection ----
  describe('character selection', () => {
    it('dispatches SET_SELECTED_PRESET_ID when a character is clicked', async () => {
      const user = userEvent.setup();
      render(<PresetSelector />);
      await user.click(screen.getByRole('button', { name: /lily/i }));

      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'SET_SELECTED_PRESET_ID',
        payload: 'lily',
      });
    });

    it('updates the browser URL after selecting a character', async () => {
      const user = userEvent.setup();
      mockEncodeToUrlParams.mockReturnValue('preset=lily');
      render(<PresetSelector />);
      await user.click(screen.getByRole('button', { name: /lily/i }));

      expect(replaceStateSpy).toHaveBeenCalled();
    });

    it('marks the selected character with aria-pressed=true', () => {
      render(<PresetSelector />);
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
      render(<PresetSelector />);
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
      render(<PresetSelector />);
      await user.click(screen.getByRole('button', { name: /lily/i }));
      expect(mockDispatch).not.toHaveBeenCalled();
    });
  });

  // ---- Custom characters (simple row, no carousel) ----
  describe('custom characters without showInstruction', () => {
    it('renders custom characters when they exist', () => {
      mockPgStateRef.current = createDefaultPgState({
        customCharacters: [
          makePreset({
            id: 'custom-1',
            name: 'MyChar',
            localizedDescriptions: { en: 'A custom character' },
          }),
        ],
      });
      render(<PresetSelector />);
      // Default characters should be visible
      expect(screen.getByText('Ramona')).toBeInTheDocument();
      expect(screen.getByText('MyChar')).toBeInTheDocument();
    });
  });

  // ---- Custom characters (carousel mode) ----
  describe('carousel mode (showInstruction + custom characters)', () => {
    beforeEach(() => {
      mockSearchParams.value = new URLSearchParams('showInstruction=true');
      mockPgStateRef.current = createDefaultPgState({
        customCharacters: [
          makePreset({
            id: 'custom-1',
            name: 'AlphaChar',
            localizedDescriptions: { en: 'Custom character 1' },
          }),
          makePreset({
            id: 'custom-2',
            name: 'BetaChar',
            localizedDescriptions: { en: 'Custom character 2' },
          }),
        ],
      });
    });

    it('renders both default and custom characters in carousel mode', () => {
      render(<PresetSelector />);
      // All defaults
      for (const preset of defaultPresetsFixture) {
        expect(screen.getByText(preset.name)).toBeInTheDocument();
      }
      // Custom characters
      expect(screen.getByText('AlphaChar')).toBeInTheDocument();
      expect(screen.getByText('BetaChar')).toBeInTheDocument();
    });

    it('renders the carousel region element', () => {
      render(<PresetSelector />);
      expect(
        screen.getByRole('region', { name: /carousel/i }),
      ).toBeInTheDocument();
    });

    it('renders initials for custom characters without images', () => {
      render(<PresetSelector />);
      // AlphaChar → "A", BetaChar → "B"
      expect(screen.getByText('A')).toBeInTheDocument();
      expect(screen.getByText('B')).toBeInTheDocument();
    });

    it('shows delete buttons for custom characters', () => {
      render(<PresetSelector />);
      expect(screen.getByLabelText('Delete AlphaChar')).toBeInTheDocument();
      expect(screen.getByLabelText('Delete BetaChar')).toBeInTheDocument();
    });

    it('does NOT show delete buttons for default characters', () => {
      render(<PresetSelector />);
      expect(screen.queryByLabelText('Delete Ramona')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Delete Lily')).not.toBeInTheDocument();
    });

    it('does NOT show delete buttons when connected', () => {
      mockConnectionState.value = 'connected';
      render(<PresetSelector />);
      expect(
        screen.queryByLabelText('Delete AlphaChar'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText('Delete BetaChar'),
      ).not.toBeInTheDocument();
    });

    it('can select a custom character', async () => {
      const user = userEvent.setup();
      render(<PresetSelector />);
      const alphaCharacterButton = screen
        .getAllByRole('button', { name: /alphachar/i })
        .find(
          (button) => !button.getAttribute('aria-label')?.startsWith('Delete'),
        );
      expect(alphaCharacterButton).toBeTruthy();
      await user.click(alphaCharacterButton as HTMLElement);

      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'SET_SELECTED_PRESET_ID',
        payload: 'custom-1',
      });
    });
  });

  // ---- Carousel pagination ----
  describe('carousel pagination', () => {
    it('creates multiple carousel pages when total characters exceed 6', () => {
      mockSearchParams.value = new URLSearchParams('showInstruction=true');
      const manyCustom: Preset[] = Array.from({ length: 5 }, (_, i) =>
        makePreset({
          id: `custom-${i}`,
          name: `Char${i}`,
          localizedDescriptions: { en: `Custom ${i}` },
        }),
      );
      mockPgStateRef.current = createDefaultPgState({
        customCharacters: manyCustom,
      });

      render(<PresetSelector />);

      // 4 defaults + 5 custom = 9 characters → 2 pages (ceil(9/6))
      // Each page is an aria-roledescription="slide" element
      const slides = screen.getAllByRole('group');
      expect(slides).toHaveLength(2);
    });

    it('does not show navigation arrows when all characters fit on one page', () => {
      mockSearchParams.value = new URLSearchParams('showInstruction=true');
      mockPgStateRef.current = createDefaultPgState({
        customCharacters: [
          makePreset({
            id: 'custom-1',
            name: 'OnlyOne',
            localizedDescriptions: { en: 'Just one' },
          }),
        ],
      });
      render(<PresetSelector />);

      // 4 defaults + 1 custom = 5, fits in one page of 6
      expect(screen.queryByText('Previous slide')).not.toBeInTheDocument();
      expect(screen.queryByText('Next slide')).not.toBeInTheDocument();
    });

    it('shows navigation arrows when characters span multiple pages', () => {
      mockSearchParams.value = new URLSearchParams('showInstruction=true');
      const manyCustom: Preset[] = Array.from({ length: 5 }, (_, i) =>
        makePreset({
          id: `custom-${i}`,
          name: `Char${i}`,
          localizedDescriptions: { en: `Custom ${i}` },
        }),
      );
      mockPgStateRef.current = createDefaultPgState({
        customCharacters: manyCustom,
      });

      render(<PresetSelector />);

      // "Previous slide" and "Next slide" are sr-only spans inside the carousel buttons
      expect(screen.getByText('Previous slide')).toBeInTheDocument();
      expect(screen.getByText('Next slide')).toBeInTheDocument();
    });
  });

  // ---- Deletion flow ----
  describe('character deletion', () => {
    beforeEach(() => {
      mockSearchParams.value = new URLSearchParams('showInstruction=true');
      mockPgStateRef.current = createDefaultPgState({
        customCharacters: [
          makePreset({
            id: 'custom-del',
            name: 'ToDelete',
            localizedDescriptions: { en: 'Will be deleted' },
          }),
        ],
      });
    });

    it('opens the delete confirmation dialog when delete button is clicked', async () => {
      const user = userEvent.setup();
      render(<PresetSelector />);
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
      render(<PresetSelector />);
      await user.click(screen.getByLabelText('Delete ToDelete'));

      const dialog = screen.getByRole('alertdialog');
      await user.click(within(dialog).getByRole('button', { name: /cancel/i }));

      // Dialog should be gone
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('dispatches DELETE_CUSTOM_CHARACTER and shows toast when confirmed', async () => {
      const user = userEvent.setup();
      render(<PresetSelector />);
      await user.click(screen.getByLabelText('Delete ToDelete'));

      const dialog = screen.getByRole('alertdialog');
      await user.click(
        within(dialog).getByRole('button', { name: /^delete$/i }),
      );

      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'DELETE_CUSTOM_CHARACTER',
        payload: 'custom-del',
      });
      expect(mockToastInfo).toHaveBeenCalledWith('Character removed');
    });

    it('selects the first default character when the currently selected custom character is deleted', async () => {
      const user = userEvent.setup();
      mockPgStateRef.current = createDefaultPgState({
        selectedPresetId: 'custom-del',
        customCharacters: [
          makePreset({
            id: 'custom-del',
            name: 'ToDelete',
            localizedDescriptions: { en: 'Selected & deleted' },
          }),
        ],
      });
      render(<PresetSelector />);
      await user.click(screen.getByLabelText('Delete ToDelete'));

      const dialog = screen.getByRole('alertdialog');
      await user.click(
        within(dialog).getByRole('button', { name: /^delete$/i }),
      );

      // Should dispatch SET_SELECTED_PRESET_ID to fall back to first default
      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'SET_SELECTED_PRESET_ID',
        payload: 'ramona',
      });
    });

    it('does NOT change selected preset when deleting a non-selected custom character', async () => {
      const user = userEvent.setup();
      mockPgStateRef.current = createDefaultPgState({
        selectedPresetId: 'ramona',
        customCharacters: [
          makePreset({
            id: 'custom-del',
            name: 'ToDelete',
            localizedDescriptions: { en: 'Not selected' },
          }),
        ],
      });
      render(<PresetSelector />);
      await user.click(screen.getByLabelText('Delete ToDelete'));

      const dialog = screen.getByRole('alertdialog');
      await user.click(
        within(dialog).getByRole('button', { name: /^delete$/i }),
      );

      // Should NOT have dispatched SET_SELECTED_PRESET_ID
      const setPresetCalls = mockDispatch.mock.calls.filter(
        (call: any[]) => call[0]?.type === 'SET_SELECTED_PRESET_ID',
      );
      expect(setPresetCalls).toHaveLength(0);
    });
  });

  // ---- Bio card ----
  describe('bio card', () => {
    it('shows the selected default character bio', () => {
      mockPgStateRef.current = createDefaultPgState({
        selectedPresetId: 'lily',
      });
      render(<PresetSelector />);
      expect(screen.getByText(/Lily:/)).toBeInTheDocument();
      expect(screen.getByText(/Shy student girl\./)).toBeInTheDocument();
    });

    it('shows the selected custom character bio with editable name and description', () => {
      mockSearchParams.value = new URLSearchParams('showInstruction=true');
      mockPgStateRef.current = createDefaultPgState({
        selectedPresetId: 'custom-bio',
        customCharacters: [
          makePreset({
            id: 'custom-bio',
            name: 'Zara',
            localizedDescriptions: {
              en: 'A mysterious traveler from the desert.',
            },
          }),
        ],
      });
      render(<PresetSelector isPaidUser />);
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
      render(<PresetSelector />);
      // Initially Ramona is selected
      expect(screen.getByText(/Ramona:/)).toBeInTheDocument();

      // Click Milo
      await user.click(screen.getByRole('button', { name: /milo/i }));
      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'SET_SELECTED_PRESET_ID',
        payload: 'milo',
      });
    });
  });

  // ---- getInitials (tested indirectly) ----
  describe('initials rendering for imageless characters', () => {
    it('renders two-letter initials for a two-word name', () => {
      mockSearchParams.value = new URLSearchParams('showInstruction=true');
      mockPgStateRef.current = createDefaultPgState({
        customCharacters: [
          makePreset({
            id: 'c1',
            name: 'John Doe',
            localizedDescriptions: { en: 'Two words' },
          }),
        ],
      });
      render(<PresetSelector />);
      expect(screen.getByText('JD')).toBeInTheDocument();
    });

    it('renders a single initial for a single-word name', () => {
      mockSearchParams.value = new URLSearchParams('showInstruction=true');
      mockPgStateRef.current = createDefaultPgState({
        customCharacters: [
          makePreset({
            id: 'c1',
            name: 'Ava',
            localizedDescriptions: { en: 'One word' },
          }),
        ],
      });
      render(<PresetSelector />);
      expect(screen.getByText('A')).toBeInTheDocument();
    });

    it('limits initials to two characters for long names', () => {
      mockSearchParams.value = new URLSearchParams('showInstruction=true');
      mockPgStateRef.current = createDefaultPgState({
        customCharacters: [
          makePreset({
            id: 'c1',
            name: 'Anna Belle Catherine',
            localizedDescriptions: { en: 'Three words' },
          }),
        ],
      });
      render(<PresetSelector />);
      expect(screen.getByText('AB')).toBeInTheDocument();
    });
  });

  // ---- showInstruction query param variants ----
  describe('showInstruction query parameter', () => {
    it('treats showInstruction="" (empty string) as true', () => {
      mockSearchParams.value = new URLSearchParams('showInstruction');
      mockPgStateRef.current = createDefaultPgState({
        customCharacters: [
          makePreset({
            id: 'c1',
            name: 'EmptyParam',
            localizedDescriptions: { en: 'test' },
          }),
        ],
      });
      render(<PresetSelector />);
      // Should be in carousel mode → custom char visible
      expect(screen.getByText('EmptyParam')).toBeInTheDocument();
    });

    it('treats showInstruction=true as true', () => {
      mockSearchParams.value = new URLSearchParams('showInstruction=true');
      mockPgStateRef.current = createDefaultPgState({
        customCharacters: [
          makePreset({
            id: 'c1',
            name: 'TrueParam',
            localizedDescriptions: { en: 'test' },
          }),
        ],
      });
      render(<PresetSelector />);
      expect(screen.getByText('TrueParam')).toBeInTheDocument();
    });

    it('treats showInstruction=false as false (simple row)', () => {
      mockSearchParams.value = new URLSearchParams('showInstruction=false');
      mockPgStateRef.current = createDefaultPgState({
        customCharacters: [
          makePreset({
            id: 'c1',
            name: 'FalseParam',
            localizedDescriptions: { en: 'test' },
          }),
        ],
      });
      render(<PresetSelector />);
      expect(screen.getByText('FalseParam')).toBeInTheDocument();
    });
  });

  // ---- Edge cases ----
  describe('edge cases', () => {
    it('renders correctly with no preset selected', () => {
      mockPgStateRef.current = createDefaultPgState({
        selectedPresetId: null,
      });
      render(<PresetSelector />);
      // Should not crash, heading still renders
      expect(screen.getByText('Choose Character')).toBeInTheDocument();
    });

    it('renders custom character with image in carousel mode', () => {
      mockSearchParams.value = new URLSearchParams('showInstruction=true');
      mockPgStateRef.current = createDefaultPgState({
        customCharacters: [
          makePreset({
            id: 'custom-img',
            name: 'WithImage',
            localizedDescriptions: { en: 'Has an image' },
            image: 'custom-avatar.webp',
          }),
        ],
      });
      render(<PresetSelector />);
      const img = screen.getByAltText('WithImage');
      expect(img).toHaveAttribute('src', '/characters/custom-avatar.webp');
    });

    it('does not dispatch delete when dialog is cancelled', async () => {
      const user = userEvent.setup();
      mockSearchParams.value = new URLSearchParams('showInstruction=true');
      mockPgStateRef.current = createDefaultPgState({
        customCharacters: [
          makePreset({
            id: 'c1',
            name: 'TestChar',
            localizedDescriptions: { en: 'test' },
          }),
        ],
      });
      render(<PresetSelector />);

      // Open and cancel the dialog – then confirm that DELETE was not dispatched
      await user.click(screen.getByLabelText('Delete TestChar'));
      const dialog = screen.getByRole('alertdialog');
      await user.click(within(dialog).getByRole('button', { name: /cancel/i }));

      const deleteCalls = mockDispatch.mock.calls.filter(
        (call: any[]) => call[0]?.type === 'DELETE_CUSTOM_CHARACTER',
      );
      expect(deleteCalls).toHaveLength(0);
    });

    it('renders exactly one page when there are 6 or fewer characters', () => {
      mockSearchParams.value = new URLSearchParams('showInstruction=true');
      mockPgStateRef.current = createDefaultPgState({
        customCharacters: [
          makePreset({
            id: 'c1',
            name: 'Extra1',
            localizedDescriptions: { en: 'extra' },
          }),
          makePreset({
            id: 'c2',
            name: 'Extra2',
            localizedDescriptions: { en: 'extra' },
          }),
        ],
      });
      render(<PresetSelector />);

      // 4 defaults + 2 custom = 6 → exactly 1 page
      const slides = screen.getAllByRole('group');
      expect(slides).toHaveLength(1);
    });

    it('renders three pages when there are 13–18 characters', () => {
      mockSearchParams.value = new URLSearchParams('showInstruction=true');
      const customChars: Preset[] = Array.from({ length: 10 }, (_, i) =>
        makePreset({
          id: `c-${i}`,
          name: `X${i}`,
          localizedDescriptions: { en: `desc ${i}` },
        }),
      );
      mockPgStateRef.current = createDefaultPgState({
        customCharacters: customChars,
      });
      render(<PresetSelector />);

      // 4 defaults + 10 custom = 14 → ceil(14/6) = 3 pages
      const slides = screen.getAllByRole('group');
      expect(slides).toHaveLength(3);
    });
  });

  // ---- Add Character button (premium gating) ----
  describe('add character button', () => {
    it('renders the "Add" button in simple row mode', () => {
      render(<PresetSelector />);
      expect(
        screen.getByRole('button', { name: /add custom character/i }),
      ).toBeInTheDocument();
      expect(screen.getByText('Add')).toBeInTheDocument();
    });

    it('renders the "Add" button in carousel mode', () => {
      mockSearchParams.value = new URLSearchParams('showInstruction=true');
      mockPgStateRef.current = createDefaultPgState({
        customCharacters: [
          makePreset({
            id: 'c1',
            name: 'Existing',
            localizedDescriptions: { en: 'test' },
          }),
        ],
      });
      render(<PresetSelector />);
      expect(
        screen.getByRole('button', { name: /add custom character/i }),
      ).toBeInTheDocument();
    });

    it('is disabled for free users (default isPaidUser=false)', () => {
      render(<PresetSelector />);
      expect(
        screen.getByRole('button', { name: /add custom character/i }),
      ).toBeDisabled();
    });

    it('shows a premium badge (Sparkles icon) for free users', () => {
      render(<PresetSelector />);
      expect(screen.getByLabelText('Premium feature')).toBeInTheDocument();
    });

    it('is enabled for paid users', () => {
      render(<PresetSelector isPaidUser />);
      expect(
        screen.getByRole('button', { name: /add custom character/i }),
      ).toBeEnabled();
    });

    it('does NOT show a premium badge for paid users', () => {
      render(<PresetSelector isPaidUser />);
      expect(
        screen.queryByLabelText('Premium feature'),
      ).not.toBeInTheDocument();
    });

    it('opens create character dialog when clicked by a paid user', async () => {
      const user = userEvent.setup();
      render(<PresetSelector isPaidUser />);
      await user.click(
        screen.getByRole('button', { name: /add custom character/i }),
      );

      // Dialog should open with create character form
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Create New Character')).toBeInTheDocument();
      expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/instructions/i)).toBeInTheDocument();
    });

    it('opens create dialog and can be filled with character details', async () => {
      const user = userEvent.setup();
      render(<PresetSelector callVoices={[]} isPaidUser />);

      // Open dialog
      await user.click(
        screen.getByRole('button', { name: /add custom character/i }),
      );

      // Verify dialog opened
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // Fill in the form
      await user.type(screen.getByLabelText(/name/i), 'Test Character');
      await user.type(
        screen.getByLabelText(/description/i),
        'A test description',
      );
      await user.type(
        screen.getByLabelText(/instructions/i),
        'Test instructions',
      );

      // Verify values were entered
      expect(screen.getByLabelText(/name/i)).toHaveValue('Test Character');
      expect(screen.getByLabelText(/description/i)).toHaveValue(
        'A test description',
      );
      expect(screen.getByLabelText(/instructions/i)).toHaveValue(
        'Test instructions',
      );
    });

    it('does NOT dispatch when clicked by a free user', async () => {
      const user = userEvent.setup();
      render(<PresetSelector />);
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
      render(<PresetSelector isPaidUser />);
      expect(
        screen.getByRole('button', { name: /add custom character/i }),
      ).toBeDisabled();
    });

    it('is hidden when the user has 10 custom characters (max limit)', () => {
      const maxCustom: Preset[] = Array.from({ length: 10 }, (_, i) =>
        makePreset({
          id: `c-${i}`,
          name: `Char${i}`,
          localizedDescriptions: { en: `desc ${i}` },
        }),
      );
      mockPgStateRef.current = createDefaultPgState({
        customCharacters: maxCustom,
      });
      render(<PresetSelector isPaidUser />);
      expect(
        screen.queryByRole('button', { name: /add custom character/i }),
      ).not.toBeInTheDocument();
    });

    it('opens dialog with empty name field regardless of existing custom characters', async () => {
      const user = userEvent.setup();
      mockPgStateRef.current = createDefaultPgState({
        customCharacters: [
          makePreset({
            id: 'c1',
            name: 'Character 1',
            localizedDescriptions: { en: 'first' },
          }),
          makePreset({
            id: 'c2',
            name: 'Character 2',
            localizedDescriptions: { en: 'second' },
          }),
        ],
      });
      render(<PresetSelector isPaidUser />);
      await user.click(
        screen.getByRole('button', { name: /add custom character/i }),
      );

      // Dialog should open with empty name field - user enters their own name
      const nameInput = screen.getByLabelText(/name/i) as HTMLInputElement;
      expect(nameInput.value).toBe('');
    });

    it('shows the premium tooltip text for free users on hover', async () => {
      const user = userEvent.setup();
      render(<PresetSelector />);
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
