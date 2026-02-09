# Preset Instruction Translations

This directory contains translated character instructions for all supported call languages. This system enables the platform to deliver character prompts in the user's selected language for authentic roleplay experiences.

## Directory Structure

```
preset-instructions/
├── README.md           # This file
├── index.ts            # Central export and helper function
├── ramona.ts           # Ramona preset translations (20 languages)
├── miyu.ts             # Miyu preset translations (20 languages)
├── luna.ts             # Luna preset translations (20 languages)
└── rafal.ts            # Rafal preset translations (20 languages)
```

## How It Works

### 1. Canonical English Instructions
- English instructions are stored in `data/presets.ts` as the primary source
- They are used as fallback when a translation isn't available
- Each preset object contains an `instructions` field with the English text

### 2. Translation Files
Each preset has a corresponding TypeScript file (e.g., `ramona.ts`) that exports:
```typescript
export const ramonaInstructions: Record<CallLanguage, string> = {
  en: "English instructions...",
  es: "Spanish instructions...",
  de: "German instructions...",
  // ... all 20 supported languages
}
```

### 3. Runtime Resolution
When a user initiates a call:
1. Frontend calls `helpers.getStateWithFullInstructions(pgState)`
2. This helper checks if a translation exists for `selectedPresetId` + `language`
3. If found, uses the translated instructions
4. If not found, falls back to the English instructions in `pgState.instructions`
5. The resolved instructions are sent to `/api/call-token`
6. The API includes them in the LiveKit metadata for the AI agent

### 4. Supported Languages
Translations are provided for all 20 call languages:
- Arabic (ar), Czech (cs), Danish (da), German (de), English (en)
- Spanish (es), Finnish (fi), French (fr), Hindi (hi), Italian (it)
- Japanese (ja), Korean (ko), Dutch (nl), Norwegian (no), Polish (pl)
- Portuguese (pt), Russian (ru), Swedish (sv), Turkish (tr), Chinese (zh)

## Adding a New Preset

When adding a new character preset:

1. **Add to `presets.ts`:**
   ```typescript
   {
     id: 'new-character',
     name: 'New Character',
     description: '...',
     image: 'new-character.webp',
     instructions: 'English instructions here...',
     sessionConfig: { ... },
   }
   ```

2. **Create translation file** `new-character.ts`:
   ```typescript
   import type { CallLanguage } from '../playground-state';

   export const newCharacterInstructions: Record<CallLanguage, string> = {
     en: 'English instructions...',
     // Add translations for other languages
   };
   ```

3. **Update `index.ts`:**
   ```typescript
   import { newCharacterInstructions } from './new-character';

   export const presetInstructionsMap: Record<
     string,
     Partial<Record<CallLanguage, string>>
   > = {
     // ... existing presets
     'new-character': newCharacterInstructions,
   };
   ```

## Adding a New Language

To add support for a new call language:

1. Add the language code to the `CallLanguage` type in `data/playground-state.ts`
2. Add an entry to the `callLanguages` array
3. Add a translation to each preset file (all 4 files must be updated)
4. The system will automatically pick up the new translation at call-time

## Best Practices

### Translation Quality
- Preserve the character's personality, voice, and tone across languages
- Adapt cultural references appropriately for the target audience
- Keep sentence structure similar to maintain rhythm and pacing
- Use natural idioms in the target language, not literal translations

### Structure
- Character instructions follow a consistent format:
  - Character introduction and background
  - Voice & Tone description
  - Personality traits
  - Themes & Interests
  - Conversation Style
- Maintain this structure across all translations

### Maintenance
- Each preset file is independently editable
- English can be included in the translation file (for completeness) or omitted (since it's canonical in presets.ts)
- Current implementation includes English in each file for clarity

## Technical Details

### Type Safety
All translations are `Record<CallLanguage, string>` to ensure:
- Only valid language codes are used
- TypeScript catches missing translations at compile time
- New languages automatically require updates to all preset files

### Performance
- Translations are imported as static data at build time
- No runtime string lookups or dynamic imports
- Each call request includes the full resolved instruction text
- No caching layer needed (immutable translations)

### Fallback Behavior
If a translation is missing:
1. `getPresetInstructions()` returns `undefined`
2. The helper function falls back to `state.instructions` (English)
3. The call proceeds with English instructions
4. No error is thrown - graceful degradation

## Future Enhancements

- Consider implementing a shared translation helper for common phrases
- Could use a translation service for new languages (currently manual)
- Might cache frequently-used instruction combinations
- Could track which languages have complete coverage per preset
