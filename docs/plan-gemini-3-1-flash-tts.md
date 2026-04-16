# Gemini 3.1 Flash TTS Integration Plan

Date: 2026-04-16
Status: Implemented
Branch: `claude/research-google-tts-rsAnm`

## 1. Goal

Upgrade the Gemini TTS backend from `gemini-2.5-pro-preview-tts` to the newly released
`gemini-3.1-flash-tts-preview` for paid users, and surface Gemini 3.1's audio tags feature
through the existing Sparkles enhance button in the text editor.

## 2. Model Comparison

| Model | Quality | Input price | Output price | Audio tags | Languages |
|---|---|---|---|---|---|
| `gemini-2.5-flash-preview-tts` | Good | $0.50/1M tokens | $10/1M tokens | No | ~30 |
| `gemini-2.5-pro-preview-tts` | Better | $1.00/1M tokens | $20/1M tokens | No | ~30 |
| `gemini-3.1-flash-tts-preview` | **Best** | $1.00/1M tokens | $20/1M tokens | **Yes (200+)** | **70+** |

Key points:
- Gemini 3.1 Flash TTS scores Elo 1,211 on the Artificial Analysis TTS leaderboard (#2 globally as of April 2026, behind ElevenLabs).
- All 30 voice names are identical across all three models — no DB changes or voice re-seeding needed.
- Gemini 3.1 adds **audio tags**: inline `[tag]` syntax embedded directly in text to control style, pace and delivery per-phrase.
- All Gemini 3.1 output is watermarked with SynthID.
- The Gemini API request format is identical across models.

## 3. Product Decisions

- **Paid users:** `gemini-3.1-flash-tts-preview` (primary) → `gemini-2.5-flash-preview-tts` (fallback on error)
- **Free users:** `gemini-2.5-flash-preview-tts` (unchanged — avoids doubling API cost)
- **No model selector in UI:** voices are the same across models; users pick a voice, not an internal model name.
- **Audio tags via enhance button:** reuse the existing Sparkles ✨ button (already present for Replicate/Orpheus voices) — enable it for Gemini voices with a Gemini-specific tag system prompt.

## 4. Audio Output Format

Gemini TTS returns raw PCM 16-bit 24 kHz audio with no WAV headers.
The existing `convertToWav()` helper in `lib/audio.ts` already handles this — no change needed.

## 5. Changes

### 5.1 Backend — model upgrade

**`apps/web/app/api/generate-voice/route.ts`**
- Paid users: `gemini-2.5-pro-preview-tts` → `gemini-3.1-flash-tts-preview`
- Fallback on pro/3.1 error: keep `gemini-2.5-flash-preview-tts`
- Free users: unchanged (`gemini-2.5-flash-preview-tts`)

**`apps/web/app/api/v1/speech/route.ts`**
- Same primary model change as above (external API endpoint)

**`apps/web/lib/api/constants.ts`**
- Display name: `'GPro (Gemini)'` → `'GPro (Gemini 3.1)'`

### 5.2 Audio tags enhance button

**`apps/web/lib/ai.ts`**
- Add `GEMINI_AUDIO_TAGS` constant:
  ```
  [cheerfully], [whispering], [laughing], [pause], [excited], [sadly],
  [nervously], [slowly], [fast], [breathily], [sighing], [giggling]
  ```

**`apps/web/app/api/generate-text/route.ts`**
- Accept optional `ttsProvider` param in the request body
- When `ttsProvider === 'gemini'`: use a Gemini-specific system prompt that instructs the model to embed `[tag]` audio tags inline in the text
- Otherwise: existing Orpheus `<emotion>` tag logic is unchanged

**`apps/web/components/audio-generator.tsx`**
- `showEnhanceButton`: `provider === "replicate"` → `provider === "replicate" || provider === "gemini"`
- Forward `ttsProvider: provider` in the `complete()` request body so the API knows which tag set to use
- Simplify `textareaRightPadding`: remove the Gemini-specific `pr-10` branch (Gemini now shows the enhance button, same as Replicate → `pr-20`)

## 6. Files Not Changed

| File | Reason |
|---|---|
| `lib/utils.ts` (`getTtsProvider`) | `model === 'gpro'` → `'gemini'` already covers 3.1 |
| `lib/ai.ts` (`getCharactersLimit`) | 1000 char limit for paid gpro users is unchanged |
| `lib/api/pricing.ts` | Key `'api_tts:google:gpro'` is provider-level, not model-level |
| `components/voice-selector.tsx` | Style textarea still works as a natural language prefix for 3.1 |
| Supabase `voices` table | Same 30 voice names; no new rows needed |
| `@google/genai` package (v1.19.0) | Already supports 3.1 model IDs |

## 7. Verification

1. Generate audio with a Gemini voice as a **paid user** → confirm logs/Sentry show `modelUsed = gemini-3.1-flash-tts-preview`
2. Generate audio with a Gemini voice as a **free user** → confirm `modelUsed = gemini-2.5-flash-preview-tts`
3. Force a 3.1 error (e.g., invalid input) → confirm fallback to `gemini-2.5-flash-preview-tts` kicks in
4. Click the ✨ button on a Gemini voice → confirm returned text contains `[tag]` audio tags (not `<tag>`)
5. Click the ✨ button on a Replicate voice → confirm returned text still uses `<laugh>` etc.
6. Verify external API: `POST /api/v1/speech` with `model: gpro` still returns audio
