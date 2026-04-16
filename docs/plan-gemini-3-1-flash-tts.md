# Gemini 3.1 Flash TTS Integration Plan

Date: 2026-04-16
Status: In progress
Branch: `claude/research-google-tts-rsAnm`

## 1. Background

Google released `gemini-3.1-flash-tts-preview` on 15 April 2026. It delivers better
quality than `gemini-2.5-pro-preview-tts` at Flash-tier pricing and introduces inline
audio tags (`[cheerfully]`, `[whispering]`, `[pause]`, etc.).

Existing customers already use Gemini 2.5 voices, so the 2.5 models stay as the
default. Gemini 3.1 is offered as an opt-in toggle when voices are compatible
(same 30 voice names across all Gemini TTS models).

---

## 2. Model Reference

| Model ID | Quality | Input | Output | Audio tags | Locales |
|---|---|---|---|---|---|
| `gemini-2.5-flash-preview-tts` | Good | $0.50/1M | $10/1M | No | 24 languages |
| `gemini-2.5-pro-preview-tts` | Better | $1.00/1M | $20/1M | No | 24 languages |
| `gemini-3.1-flash-tts-preview` | **Best** (Elo 1,211, #2 globally) | $1.00/1M | $20/1M | **Yes (200+)** | **80+ locales / 70+ languages** |

All three models share the same 30 voice names. The API request format is identical.

---

## 3. Changes Required

### 3.1 Revert model substitution from previous commit

The previous implementation commit mistakenly replaced `gemini-2.5-pro-preview-tts`
with `gemini-3.1-flash-tts-preview` as the paid-user default. This must be reverted
before the toggle is added.

| File | Revert |
|---|---|
| `apps/web/app/api/generate-voice/route.ts` | `gemini-3.1-flash-tts-preview` → `gemini-2.5-pro-preview-tts` (line ~241) |
| `apps/web/app/api/v1/speech/route.ts` | Same (line ~295) |
| `apps/web/lib/api/constants.ts` | `name: 'GPro (Gemini 3.1)'` → `'GPro (Gemini 2.5)'` |

---

### 3.2 Add Switch UI component

No `Switch` component exists in `components/ui/`. Create it following the same pattern
as `components/ui/checkbox.tsx` (imports from the `radix-ui` umbrella package, which
already includes `@radix-ui/react-switch@1.2.6` as a transitive dependency).

**New file:** `apps/web/components/ui/switch.tsx`

```tsx
"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"
import { cn } from "@/lib/utils"

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0",
      )}
    />
  </SwitchPrimitive.Root>
))
Switch.displayName = SwitchPrimitive.Root.displayName

export { Switch }
```

---

### 3.3 i18n — add toggle label

Add one new key to the `generate.voiceSelector` object in **all 6 locale files**:

| Locale | File | Key | Value |
|---|---|---|---|
| en | `messages/en.json` | `useNewModelLabel` | `"Use new AI model (Gemini 3.1)"` |
| es | `messages/es.json` | `useNewModelLabel` | `"Usar nuevo modelo de IA (Gemini 3.1)"` |
| fr | `messages/fr.json` | `useNewModelLabel` | `"Utiliser le nouveau modèle IA (Gemini 3.1)"` |
| de | `messages/de.json` | `useNewModelLabel` | `"Neues KI-Modell verwenden (Gemini 3.1)"` |
| it | `messages/it.json` | `useNewModelLabel` | `"Usa il nuovo modello AI (Gemini 3.1)"` |
| da | `messages/da.json` | `useNewModelLabel` | `"Brug ny AI-model (Gemini 3.1)"` |

Insert the key immediately after `grokInfo` in each file's `voiceSelector` block.

---

### 3.4 State wiring

**`apps/web/app/[lang]/(dashboard)/dashboard/generate/generateui.client.tsx`**

Add `useNewModel` boolean state (default `false`) alongside `selectedStyle`:

```tsx
const [useNewModel, setUseNewModel] = useState(false);
```

Pass it down:
- `<VoiceSelector … useNewModel={isGeminiVoice ? useNewModel : undefined} setUseNewModel={setUseNewModel} />`
- `<AudioGenerator … useNewModel={isGeminiVoice ? useNewModel : undefined} />`

---

### 3.5 VoiceSelector — render the toggle

**`apps/web/components/voice-selector.tsx`**

Add props:
```tsx
useNewModel?: boolean;
setUseNewModel: Dispatch<SetStateAction<boolean>>;
```

Render the Switch directly below the voice dropdown (before the style textarea),
visible only when `isGeminiVoice`:

```tsx
{isGeminiVoice && (
  <div className="flex items-center gap-2">
    <Switch
      id="use-new-model"
      checked={useNewModel ?? false}
      onCheckedChange={setUseNewModel}
    />
    <Label htmlFor="use-new-model" className="text-sm cursor-pointer">
      {dict.voiceSelector.useNewModelLabel}
    </Label>
  </div>
)}
```

---

### 3.6 AudioGenerator — include flag in request body

**`apps/web/components/audio-generator.tsx`**

Add prop `useNewModel?: boolean`. Include it in `requestBody`:

```tsx
const requestBody = useMemo(
  () => ({
    text,
    voice: selectedVoice?.name,
    styleVariant: isGeminiVoice ? selectedStyle : "",
    language: isGrokVoice ? selectedGrokLanguage : undefined,
    useNewModel: isGeminiVoice ? (useNewModel ?? false) : undefined,
  }),
  […, useNewModel],
);
```

---

### 3.7 generate-voice/route.ts — model selection

**`apps/web/app/api/generate-voice/route.ts`**

Accept `useNewModel` from the request body and use it to select the Gemini model:

```ts
const useNewModel = Boolean(body.useNewModel);
```

Updated decision tree (paid users):

```
if (userHasPaid) {
  modelUsed = useNewModel
    ? 'gemini-3.1-flash-tts-preview'
    : 'gemini-2.5-pro-preview-tts';
  // on failure → fallback to 'gemini-2.5-flash-preview-tts'
} else {
  modelUsed = 'gemini-2.5-flash-preview-tts';  // unchanged
}
```

Free users always get `gemini-2.5-flash-preview-tts` regardless of the toggle.

---

### 3.8 v1/speech/route.ts — external API (optional, deferred)

The external API currently always uses `gemini-2.5-pro-preview-tts` for paid users.
Exposing `use_new_model` as an API param is a separate task. No changes in this PR.

---

## 4. FAQ & i18n Language Updates

### 4.1 Context

The existing FAQ answer "Which languages are supported for Speech Generation?" lists
24 languages (Gemini 2.5 TTS). With the new toggle, users on Gemini 3.1 can use
**80+ locales / 70+ distinct languages**.

### 4.2 FAQ answer structure (English template)

The updated answer should split by model tier:

```
Language support depends on the selected voice and model.

**Gemini 2.5 voices (default)** support 24 languages:
🇪🇬 Arabic (Egyptian), 🇧🇩 Bengali (Bangladesh), 🇳🇱 Dutch (Netherlands),
🇺🇸 English (US), 🇮🇳 English/Hindi (India), 🇫🇷 French (France),
🇩🇪 German (Germany), 🇮🇳 Hindi (India), 🇮🇩 Indonesian (Indonesia),
🇮🇹 Italian (Italy), 🇯🇵 Japanese (Japan), 🇰🇷 Korean (Korea),
🇮🇳 Marathi (India), 🇵🇱 Polish (Poland), 🇧🇷 Portuguese (Brazil),
🇷🇴 Romanian (Romania), 🇷🇺 Russian (Russia), 🇺🇸 Spanish (US),
🇮🇳 Tamil (India), 🇮🇳 Telugu (India), 🇹🇭 Thai (Thailand),
🇹🇷 Turkish (Turkey), 🇺🇦 Ukrainian (Ukraine), 🇻🇳 Vietnamese (Vietnam).

**Gemini 3.1 voices (when "Use new AI model" is enabled)** support 70+ languages
across 80+ regional locales, including everything above plus:
[FULL LIST — see §4.3 below]

Other voices remain language-specific:
🇬🇧 Dan (English UK), 🇮🇹 Pietro (Italian), 🇺🇸 Emma (English US),
🇪🇸 Javi (Spanish), 🇺🇸 Josh (English US), 🇺🇸 Tara (English US).
```

### 4.3 Gemini 3.1 additional languages (⚠️ to be confirmed)

The following languages are known to be added in Gemini 3.1 beyond the 24-language
Gemini 2.5 baseline. **Verify the complete list against Google's official docs at
`https://cloud.google.com/text-to-speech/docs/gemini-tts#language_availability`
before writing the FAQ copy.**

Known additions (not exhaustive):
- Afrikaans, Albanian, Amharic, Armenian, Azerbaijani, Basque, Bosnian, Bulgarian,
  Catalan, Chinese (Simplified / Traditional), Croatian, Czech, Danish, Estonian,
  Filipino (Tagalog), Finnish, Galician, Georgian, Greek, Gujarati, Hausa, Hebrew,
  Hungarian, Icelandic, Irish, Javanese, Kannada, Kazakh, Khmer, Latvian, Lithuanian,
  Macedonian, Malay, Maltese, Mongolian, Nepali, Norwegian, Persian, Punjabi,
  Serbian, Sinhala, Slovak, Slovenian, Somali, Swahili, Swedish, Urdu, Uzbek,
  Welsh, Zulu
- English regional variants: en-US, en-GB, en-AU, en-IN, en-CA, en-ZA (and accents:
  Valley, Southern, British RP, etc.)
- Spanish variants: es-ES, es-MX, es-US, es-AR
- Portuguese variants: pt-BR, pt-PT
- French variants: fr-FR, fr-CA, fr-BE
- Arabic variants: ar-EG, ar-SA, ar-AE

### 4.4 voiceSelector.geminiInfo tooltip update

Current value (en.json):
> "It supports 24 languages: …"

New value:
> "Supports 24 languages by default.\nEnable \"Use new AI model\" for 70+ languages with Gemini 3.1."

Update in all 6 locale files (`en`, `es`, `fr`, `de`, `it`, `da`).

### 4.5 Locale files to update

Both `landing.faq.groups[0].questions[0].answer` (speech generation FAQ) and
`generate.voiceSelector.geminiInfo` must be updated in:

- `apps/web/messages/en.json`
- `apps/web/messages/es.json`
- `apps/web/messages/fr.json`
- `apps/web/messages/de.json`
- `apps/web/messages/it.json`
- `apps/web/messages/da.json`

---

## 5. Files Changed Summary

| File | Change |
|---|---|
| `apps/web/components/ui/switch.tsx` | **New** — Radix UI Switch component |
| `apps/web/components/voice-selector.tsx` | Add Switch toggle for Gemini voices |
| `apps/web/components/audio-generator.tsx` | Add `useNewModel` prop + request field |
| `apps/web/app/[lang]/(dashboard)/dashboard/generate/generateui.client.tsx` | Add `useNewModel` state, wire to children |
| `apps/web/app/api/generate-voice/route.ts` | Revert to 2.5 Pro; add `useNewModel` model selection |
| `apps/web/app/api/v1/speech/route.ts` | Revert to 2.5 Pro (no toggle for external API yet) |
| `apps/web/lib/api/constants.ts` | Revert display name to `'GPro (Gemini 2.5)'` |
| `apps/web/messages/en.json` | Add toggle label; update FAQ + geminiInfo |
| `apps/web/messages/es.json` | Same |
| `apps/web/messages/fr.json` | Same |
| `apps/web/messages/de.json` | Same |
| `apps/web/messages/it.json` | Same |
| `apps/web/messages/da.json` | Same |

---

## 6. Files NOT Changed

| File | Reason |
|---|---|
| `lib/utils.ts` (`getTtsProvider`) | `model === 'gpro'` → `'gemini'` covers 3.1 too |
| `lib/ai.ts` (`getCharactersLimit`) | 1000-char paid limit unchanged |
| `lib/api/pricing.ts` | Pricing key is provider-level (`'api_tts:google:gpro'`) |
| Supabase `voices` table | Same 30 voice names, no new rows needed |
| `@google/genai` package (v1.19.0) | Already supports 3.1 model IDs |
| `app/api/v1/speech/route.ts` (toggle) | External API toggle deferred to a separate task |

---

## 7. Verification

1. **Default path (paid user, toggle off):** generate audio → Sentry shows `modelUsed = gemini-2.5-pro-preview-tts`
2. **New model path (paid user, toggle on):** generate audio → Sentry shows `modelUsed = gemini-3.1-flash-tts-preview`
3. **Free user:** toggle visible but model stays `gemini-2.5-flash-preview-tts` regardless
4. **Fallback:** force a 3.1 API error → confirm fallback to `gemini-2.5-flash-preview-tts`
5. **Toggle visibility:** only shows for Gemini voices; invisible for Grok and Replicate voices
6. **External API:** `POST /api/v1/speech` with `model: gpro` continues to return 2.5 Pro audio
7. **FAQ:** confirm language list displays correctly in all 6 locales on the landing page
8. **Tooltip:** hover the info icon on a Gemini voice → updated tooltip text appears
