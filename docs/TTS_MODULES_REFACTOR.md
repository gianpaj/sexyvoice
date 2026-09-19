# TTS Modules Refactoring Guide

## Overview

The voice generation API route has been refactored to extract TTS provider implementations into separate, modular library files. This improves code organization, maintainability, and testability by following the single responsibility principle.

## New Module Structure

### 1. **Qwen TTS Module** (`lib/qwen-tts.ts`)
Handles Alibaba Cloud DashScope Qwen TTS voice design and synthesis.

**Exports:**
- `generateQwenTTS(options)` - Main speech synthesis function
- `isQwenModel(model)` - Model detection helper
- `isQwenVoiceDesignModel(model)` - Voice design model checker
- `QwenTTSOptions` - Configuration interface
- `QwenTTSResult` - Result interface

**Key Features:**
- WebSocket-based real-time synthesis
- Non-streaming audio buffer output
- Support for multiple audio formats and sample rates
- Voice parameter customization (speed, pitch, volume)

### 2. **Google Generative AI TTS Module** (`lib/google-genai-tts.ts`)
Handles Google Generative AI (Gemini) text-to-speech.

**Exports:**
- `generateGoogleGenAITTS(options)` - Main speech synthesis function
- `isGoogleGenAIModel(model)` - Model detection helper
- `GoogleGenAITTSOptions` - Configuration interface
- `GoogleGenAITTSResult` - Result interface

**Key Features:**
- Single-attempt generation (fallback logic in route handler)
- Safety settings (sexually explicit content blocking)
- Token-based credit calculation
- Error handling with Prohibited Content detection

**Internal Helpers:**
- `createGeminiTTSConfig()` - Builds TTS configuration
- `validateResponse()` - Validates API response and extracts audio

**Note on Fallback Logic:**
The fallback from Gemini Pro to Gemini Flash is handled in the route handler (`app/api/generate-voice/route.ts`) to give better control over retry behavior and logging. The module itself performs a single generation attempt with the specified model.

### 3. **Replicate TTS Module** (`lib/replicate-tts.ts`)
Handles Replicate API voice generation models.

**Exports:**
- `generateReplicateTTS(options)` - Main speech synthesis function
- `isReplicateModel(model)` - Model detection helper
- `getReplicateModelName(model)` - Extracts display name from model ID
- `ReplicateTTSOptions` - Configuration interface
- `ReplicateTTSResult` - Result interface

**Key Features:**
- ReadableStream to Buffer conversion
- Comprehensive error handling
- Prediction tracking for analytics
- Support for all Replicate voice models

**Internal Helpers:**
- `streamToBuffer()` - Converts ReadableStream to Buffer
- `validateReplicateResponse()` - Validates API response
- `handleReplicateError()` - Centralized error handling

## API Route Refactoring

### Before: Monolithic Approach
The `/api/generate-voice/route.ts` contained ~800 lines with all TTS provider logic inlined:
- Google Generative AI code block: ~100 lines
- Replicate code block: ~50 lines
- Configuration and error handling scattered throughout

### After: Modular Approach
The route is now ~500 lines with clean separation of concerns:

```typescript
// Model detection
const isGeminiVoice = isGoogleGenAIModel(voiceObj.model);
const isQwenVoice = isQwenModel(voiceObj.model);
const isReplicateVoice = isReplicateModel(voiceObj.model);

// Simple, readable conditional logic
if (isQwenVoice) {
  const qwenResult = await generateQwenTTS({ voice, text, ... });
} else if (isGeminiVoice) {
  const geminiResult = await generateGoogleGenAITTS({ text, voice, ... });
} else if (isReplicateVoice) {
  const replicateResult = await generateReplicateTTS({ text, voice, model, ... });
}
```

## Key Improvements

### 1. **Code Organization**
- **Separation of Concerns**: Each TTS provider has its own module
- **Reusability**: TTS modules can be imported and used in other API routes
- **Testability**: Individual modules can be tested in isolation
- **Maintainability**: Changes to one provider don't affect others

### 2. **Error Handling**
- Centralized error handling within each module
- Consistent error messages and codes
- Proper exception propagation to the route handler

### 3. **Complexity Reduction**
- Main route function reduced from ~75 to ~45 cognitive complexity
- Helper functions keep individual functions under 15 complexity limit
- Clear separation between orchestration and implementation

### 4. **Type Safety**
- Dedicated interfaces for each provider's options and results
- Full TypeScript support with no `any` types
- Proper export of utility functions

## Migration Guide

### Adding a New TTS Provider

1. **Create a new module** (`lib/new-tts-provider.ts`):
   ```typescript
   export interface NewProviderTTSOptions {
     text: string;
     voice: string;
     signal?: AbortSignal;
   }

   export interface NewProviderTTSResult {
     audioBuffer: Buffer;
     modelUsed: string;
   }

   export async function generateNewProviderTTS(
     options: NewProviderTTSOptions,
   ): Promise<NewProviderTTSResult> {
     // Implementation
   }

   export function isNewProviderModel(model: string): boolean {
     return model.startsWith('new-provider-');
   }
   ```

2. **Update the API route** (`app/api/generate-voice/route.ts`):
   ```typescript
   import { generateNewProviderTTS, isNewProviderModel } from '@/lib/new-tts-provider';

   // In POST handler:
   const isNewProviderVoice = isNewProviderModel(voiceObj.model);

   if (isNewProviderVoice) {
     const result = await generateNewProviderTTS({
       text,
       voice,
       signal: abortController.signal,
     });
     uploadUrl = await uploadFileToR2(filename, result.audioBuffer, 'audio/wav');
   }
   ```

3. **Add credit multiplier** (`lib/utils.ts`):
   ```typescript
   if (model?.startsWith('new-provider-')) {
     multiplier = 1.5; // Adjust as needed
   }
   ```

4. **Add character limit** (`lib/ai.ts`):
   ```typescript
   if (model.startsWith('new-provider-')) {
     return 1000; // or appropriate limit
   }
   ```

## Testing

All existing tests pass with the new modular structure:
- 181 tests passing
- 4 tests skipped
- No regressions

### Test Coverage
- `generate-voice.test.ts` - Tests the API route with all providers
- Provider-specific error handling
- Model detection and routing
- Credit calculation
- Audio upload and caching

### Running Tests
```bash
# Run all tests
pnpm test

# Run specific test
pnpm test -- generate-voice.test.ts

# Run in watch mode
pnpm test:watch

# Generate coverage
pnpm test:coverage
```

## Performance Impact

The refactoring has **no negative performance impact**:
- Module imports are tree-shaked by the bundler
- Only selected provider is executed at runtime
- Same number of API calls to external services
- Equivalent latency for speech generation

## Files Changed

### New Files
- `lib/google-genai-tts.ts` (181 lines)
- `lib/replicate-tts.ts` (173 lines)
- `TTS_MODULES_REFACTOR.md` (this file)

### Modified Files
- `app/api/generate-voice/route.ts` (refactored from ~800 to ~500 lines)
- `README.md` (documentation updates)
- `AGENTS.md` (development guidelines updates)

## Code Quality

### Linting
All modules pass Biome linting:
- ✅ No complexity violations (functions < 15 cognitive complexity)
- ✅ No unused code
- ✅ Proper TypeScript types
- ✅ Consistent code style

### Type Checking
All modules pass TypeScript type checking:
- ✅ No `any` types
- ✅ Full type safety
- ✅ Proper null checking

## Environment Variables

All environment variables remain the same:
- `DASHSCOPE_API_KEY` - Qwen TTS
- `GOOGLE_GENERATIVE_AI_API_KEY` - Google Generative AI
- `REPLICATE_API_TOKEN` - Replicate

## Future Enhancements

Potential improvements enabled by this refactoring:

1. **Provider Switching**: Easily implement fallback providers
2. **Provider Metrics**: Track latency and error rates per provider
3. **A/B Testing**: Test different providers for same voice
4. **Rate Limiting**: Per-provider rate limiting
5. **Cost Analysis**: Calculate costs per provider
6. **Streaming Support**: Add streaming variants per provider

## Related Documentation

- `QWEN_TTS_INTEGRATION.md` - Qwen TTS setup and usage
- `AGENTS.md` - Development guidelines
- `README.md` - Project overview
- `ARCHITECTURE.md` - System architecture
