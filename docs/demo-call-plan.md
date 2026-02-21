# Landing Page Demo Call – Implementation Plan

## Goal

Replace the current hero `IncomingCallButton` with a **visual audio demo** of the AI voice call feature. The demo plays a pre-recorded audio clip for one of 4 characters while showing an **energy-driven avatar pulse** and a **real-frequency waveform visualizer** — giving visitors an instant taste of the product without requiring login, LiveKit, or any backend.

**No transcripts are displayed.** The demo is purely audio + visual animation.

---

## Existing Assets

| Asset | Path | Notes |
|---|---|---|
| Demo call data | `data/demo-transcripts.ts` | 4 characters: `ramona`, `miyu`, `luna`, `rafal` |
| Demo audio files | `public/demo-calls/` | See actual durations below |
| Character avatars | `public/characters/` | `ramona.webp`, `rafal.webp` exist; `miyu.webp` and `luna.webp` **TODO** |
| Landing page | `app/[lang]/page.tsx` | Hero section currently uses `IncomingCallButton` |
| Avatar ring style | `components/call/preset-selector.tsx` → `AvatarButton` | Gradient ring + image pattern to replicate |

### Actual audio durations (via `ffprobe`)

| File | Format | Duration | Size |
|---|---|---|---|
| `ramona.mp3` | mp3 | **7.85 s** | 96 KB |
| `luna.wav` | wav | **11.90 s** | 2.2 MB |
| `miyu.wav` | wav | **18.90 s** | 3.5 MB |
| `rafal.wav` | wav | **18.84 s** | 3.4 MB |

### Pre-implementation prep (owner: user)

1. **Convert `.wav` → `.mp3`** for luna, miyu, and rafal. Target ~64 kbps mono (~100 KB each).
2. **Create `miyu.webp` and `luna.webp`** avatar images in `public/characters/`.
3. **Update `durationSeconds`** in `demo-transcripts.ts` to match actual durations after conversion (the values are currently all `18` which is wrong for ramona and luna).

---

## Architecture

### New files

| File | Purpose |
|---|---|
| `hooks/use-audio-analyser.ts` | Web Audio API hook — analyses `HTMLAudioElement` frequency data, returns multiband `Float32Array[]` |
| `components/demo-call/demo-call-section.tsx` | Server component wrapper: i18n strings + renders the client component |
| `components/demo-call/demo-call-player.tsx` | `'use client'` – Orchestrator: character picker, audio playback, waveform, avatar animation |
| `components/demo-call/demo-character-avatar.tsx` | `'use client'` – Animated avatar with energy-driven speaking pulse |
| `components/demo-call/demo-waveform.tsx` | `'use client'` – Frequency-driven visualizer bars powered by `useAudioAnalyser` |

### No new dependencies

- Audio playback: native `HTMLAudioElement`
- Audio analysis: native Web Audio API (`AudioContext`, `AnalyserNode`, `MediaElementAudioSourceNode`)
- Animations: Tailwind CSS transitions + inline styles driven by frequency data
- No Framer Motion needed (no transcript bubbles to animate)

---

## `useAudioAnalyser` Hook

### API

```ts
function useAudioAnalyser(
  audioElement: HTMLAudioElement | null,
  bands?: number,   // default 5
  loPass?: number,   // default 100 (frequency bin index)
  hiPass?: number,   // default 600 (frequency bin index)
): Float32Array[]
```

Returns an array of `bands` `Float32Array` chunks, each containing normalized frequency values (0–1). When `audioElement` is `null`, returns `[]`.

### Implementation details

- Creates an `AudioContext`, `MediaElementAudioSourceNode`, and `AnalyserNode` with `fftSize = 2048`.
- Runs a `requestAnimationFrame` loop calling `analyser.getFloatFrequencyData()`.
- Normalizes dB values: clamps to `[-100, -10]` range, maps to 0–1, applies `Math.sqrt` for perceptual scaling.
- Slices the frequency array to `[loPass, hiPass]` to focus on voice-range frequencies.
- Splits the slice into `bands` equal chunks.
- Cleans up all Web Audio nodes and cancels rAF on unmount or when `audioElement` changes.

### Critical gotchas

#### 1. `createMediaElementSource` is one-shot per element

You can only call `createMediaElementSource()` once per `HTMLAudioElement`. Solution: **create a fresh `Audio()` object each time** (on play, or on character switch + auto-play). Never reuse a source'd element.

#### 2. AudioContext autoplay policy

Browsers may create `AudioContext` in a `suspended` state. Add a resume call:

```ts
const ctx = new AudioContext();
if (ctx.state === 'suspended') {
  ctx.resume();
}
```

This is safe because we always gate playback behind a user click.

#### 3. CORS

Demo files in `/public/demo-calls/` are same-origin — no issue. If ever moved to a CDN, add `crossOrigin="anonymous"` to the Audio element and ensure CORS headers.

#### 4. Single rAF loop

The hook runs one `requestAnimationFrame` loop for frequency sampling. The `DemoCallPlayer` does **not** run a second loop. Instead, `currentTime` is read directly from the audio element during render — the hook's state updates (~60 fps) naturally trigger re-renders that pick up the latest time.

---

## Speaking Detection

We combine two signals to determine when the **agent** character's avatar should pulse:

### 1. Audio energy (from `useAudioAnalyser`)

```ts
const avgEnergy =
  frequencyBands.length > 0
    ? frequencyBands.reduce((sum, band) => {
        const bandAvg = band.reduce((s, v) => s + v, 0) / (band.length || 1);
        return sum + bandAvg;
      }, 0) / frequencyBands.length
    : 0;

const hasAudioEnergy = avgEnergy > 0.15; // tune this threshold
```

### 2. Why not just energy alone?

The demo audio contains both the AI agent and a mock user voice. Energy alone can't distinguish who is speaking. For now this is acceptable — the avatar pulses whenever *anyone* speaks. If we later add transcript timing data back, we can gate it: `isAgentSpeaking = hasAudioEnergy && currentSpeaker === 'agent'`.

---

## Detailed Component Design

### 1. `DemoCallSection` (Server Component)

```
Props: { lang: Locale }
```

- Loads i18n dictionary for translatable labels.
- Renders `<DemoCallPlayer />`.
- This component **replaces** the current `IncomingCallButton` in the hero section of `app/[lang]/page.tsx`.

### 2. `DemoCallPlayer` (Client Component) — *core logic*

#### State

| State | Type | Purpose |
|---|---|---|
| `selectedCharId` | `string` | Currently selected character key (default: `'ramona'`) |
| `audioElement` | `HTMLAudioElement \| null` | Current audio element, passed to `useAudioAnalyser` |
| `isPlaying` | `boolean` | Whether audio is currently playing |

**Derived in render (no state needed):**

| Value | Source | Purpose |
|---|---|---|
| `currentTime` | `audioElement?.currentTime ?? 0` | Current playback position |
| `duration` | `demoCallData[selectedCharId].durationSeconds` | Total duration for timer display |
| `frequencyBands` | `useAudioAnalyser(audioElement)` | Real frequency data |
| `avgEnergy` | Computed from `frequencyBands` | Scalar 0–1 for speaking animation |

#### Character metadata map

Static map providing display info for the 4 demo characters:

```ts
const demoCharacters = [
  { id: 'ramona', name: 'Ramona', image: 'ramona.webp', accent: 'from-red-500 to-pink-500' },
  { id: 'miyu',   name: 'Miyu',   image: 'miyu.webp',   accent: 'from-blue-400 to-cyan-400' },
  { id: 'luna',   name: 'Luna',   image: 'luna.webp',    accent: 'from-amber-400 to-orange-500' },
  { id: 'rafal',  name: 'Rafal',  image: 'rafal.webp',   accent: 'from-violet-500 to-fuchsia-500' },
];
```

#### Playback logic

1. On **play**: create a **new** `Audio()` element with `src` from `demoCallData[selectedCharId].audioSrc`. Store in ref, set as `audioElement` state (triggers `useAudioAnalyser`). Call `audio.play()`. Set `isPlaying = true`.
2. The `useAudioAnalyser` hook's rAF loop drives re-renders at ~60 fps. Each render reads `audio.currentTime` for the timer.
3. On **audio `ended`** event: set `isPlaying = false`, set `audioElement = null` (tears down analyser).
4. On **stop click**: pause audio, set `audioElement = null`, set `isPlaying = false`.
5. On **character switch**: stop current audio → set `audioElement = null` → update `selectedCharId` → **auto-play** the new character immediately (create new `Audio()`, same as step 1).
6. On **component unmount**: pause audio (cleanup handled by hook + effect).

#### Layout (mobile-first)

```
┌──────────────────────────────────┐
│                                  │
│  [Ramona] [Miyu] [Luna] [Rafal]  │  ← character picker (avatar circles)
│                                  │
│         ┌──────────┐             │
│         │          │             │
│         │  avatar  │             │  ← large avatar with energy-driven pulse ring
│         │          │             │
│         └──────────┘             │
│      Character Name              │
│                                  │
│     ═══ waveform bars ═══        │  ← real frequency-driven bars
│                                  │
│         00:05 / 00:18            │  ← timer
│                                  │
│      [ ▶ Play Demo ]             │  ← play/stop button
│                                  │
└──────────────────────────────────┘
```

### 3. `DemoCharacterAvatar` (Client Component)

Props: `{ image: string; name: string; isSpeaking: boolean; energy: number; accentGradient: string }`

- Renders a circular avatar with the character image (`next/image`), matching the style from `PresetSelector`'s `AvatarButton` (gradient ring + inner padding).
- When `isSpeaking` is `true`:
  - **Ring scale** driven by `energy`: `transform: scale(1 + energy * 0.1)` — natural pulse that follows actual audio amplitude.
  - **Glow effect**: `box-shadow` spread and opacity scaled by `energy`, using the character's accent color.
- When not speaking: static ring, no glow.
- Uses CSS `transition` (not `animation`) for smooth entry/exit.

### 4. `DemoWaveform` (Frequency-Driven)

Props: `{ frequencyBands: Float32Array[]; isActive: boolean }`

- Renders one bar per band in `frequencyBands` (typically 5 bars).
- Each bar's **height** is mapped from the average value of its `Float32Array` chunk: `avgValue * maxBarHeight`.
- Uses inline `style={{ height }}` with CSS `transition: height 80ms ease-out` for smooth interpolation.
- When `isActive` is `false`, all bars render at minimum height (4px).
- Bars are `aria-hidden="true"` (purely decorative).
- **No CSS keyframe animations** — real frequency data provides all the movement.

---

## Integration into Landing Page

### What changes in `app/[lang]/page.tsx`

**Remove:**
```tsx
<div className="mx-auto">
  <IncomingCallButton animated lang={lang} />
</div>
```

**Replace with:**
```tsx
<DemoCallSection lang={lang} />
```

The demo sits inside the existing hero section, between the subtitle and the sign-up CTA button. The overall hero structure becomes:

```
h1 title
subtitle
→ [Demo player: character picker + avatar + waveform + play button]
[Sign up CTA button]
"No credit card required"
```

---

## i18n Additions

Add the following keys to all 6 dictionary files (`en.json`, `es.json`, `de.json`, `da.json`, `it.json`, `fr.json`):

```json
{
  "landing": {
    "demoCall": {
      "playButton": "Play Demo",
      "stopButton": "Stop",
      "pickCharacter": "Pick a character"
    }
  }
}
```

Kept minimal since there are no transcript-related strings.

---

## CSS / Tailwind Additions

Add to `globals.css`:

```css
/* Speaking pulse ring — CSS fallback if inline energy-driven styles aren't applied */
@keyframes speaking-pulse {
  0%, 100% {
    transform: scale(1);
    opacity: 0.7;
  }
  50% {
    transform: scale(1.08);
    opacity: 1;
  }
}

.animate-speaking-pulse {
  animation: speaking-pulse 1.2s ease-in-out infinite;
}
```

The waveform bars and avatar ring are primarily driven by inline `style` from real frequency data, not CSS keyframes.

---

## Step-by-step Implementation Order

### Phase 1: Prep (owner: user)
1. **Convert `.wav` → `.mp3`** for luna, miyu, rafal.
2. **Create `miyu.webp` and `luna.webp`** character avatars.
3. **Update `durationSeconds`** in `demo-transcripts.ts`:
   - `ramona`: `7.85` (currently says `18`)
   - `luna`: update after mp3 conversion (currently `11.90` as wav)
   - `miyu`: update after mp3 conversion (currently `18.90` as wav)
   - `rafal`: update after mp3 conversion (currently `18.84` as wav)
4. **Update `audioSrc`** paths if filenames change.

### Phase 2: Hook
5. **`hooks/use-audio-analyser.ts`** — Web Audio API hook. Verify:
   - AudioContext resumes correctly after user click.
   - Frequency bands return non-zero values during playback.
   - Cleanup works: no orphaned AudioContexts or rAF loops after unmount.
   - Fresh `Audio()` element per character works without errors.

### Phase 3: Components (bottom-up)
6. **`DemoWaveform`** — Receives `frequencyBands: Float32Array[]`, maps to bar heights. No internal state.
7. **`DemoCharacterAvatar`** — Avatar image + energy-driven speaking animation.
8. **`DemoCallPlayer`** — Wire up:
   - Character selection with auto-play on switch.
   - Fresh `Audio()` creation per play/switch.
   - `useAudioAnalyser(audioElement)` for frequency data.
   - `currentTime` read from `audioElement` in render.
   - Timer display.
9. **`DemoCallSection`** — Thin server wrapper with i18n.
10. **Add i18n keys** to all 6 dictionary files.

### Phase 4: Integration
11. **Replace `IncomingCallButton`** with `<DemoCallSection lang={lang} />` in the hero section of `app/[lang]/page.tsx`.
12. **Test across browsers**:
    - Safari: AudioContext resume after user gesture, `.mp3` codec support.
    - Firefox: `createMediaElementSource` behavior.
    - Mobile: touch events, layout at small widths.
13. **Run `pnpm run fixall`** and fix any linting/type issues.

### Phase 5: Polish (optional)
14. **Tune energy threshold** — play all 4 demo clips and adjust the `0.15` threshold so the speaking animation feels responsive but doesn't flicker during brief pauses.
15. Animate character switch with a crossfade transition.
16. Add PostHog analytics event: `demo_call_played { character: string, completed: boolean }`.
17. Consider `loPass` / `hiPass` tuning per character if voices have different frequency profiles.

---

## Performance Considerations

- **Audio files**: `.mp3` at 64 kbps mono → each clip ≈ 60–150 KB. Use `<link rel="preload">` for the default character's audio. Other characters' audio is created on demand (character switch).
- **Images**: Character avatars are small `.webp` files, optimized by Next.js `<Image>`.
- **No SSR hydration cost**: `DemoCallPlayer` is a client component but the initial HTML is just avatar images + a play button. No `AudioContext` or audio element is created until the user clicks play.
- **Single rAF loop**: Only runs while audio is playing, managed by `useAudioAnalyser`. Automatically torn down when `audioElement` becomes `null`. No separate `currentTime` polling loop.
- **Re-render frequency**: ~60 fps during playback (driven by hook state updates). Acceptable because:
  - Component tree is very shallow (avatar + 5 waveform bars + timer text).
  - Waveform bars use inline `style` updates (React fast path).
  - Playback is at most ~19 seconds.

---

## Accessibility

- Play/stop button has clear `aria-label`.
- Character selector uses `role="radiogroup"` with `role="radio"` + `aria-checked` on each avatar.
- Timer is `aria-live="off"` to avoid spamming screen readers.
- Waveform bars are `aria-hidden="true"` (purely decorative).

---

## File tree (final state)

```
hooks/
└── use-audio-analyser.ts          # Web Audio API frequency analysis hook

components/demo-call/
├── demo-call-section.tsx          # Server component wrapper
├── demo-call-player.tsx           # Client component: orchestrator
├── demo-character-avatar.tsx      # Energy-driven animated avatar
└── demo-waveform.tsx              # Frequency-driven visualizer bars

data/
└── demo-transcripts.ts            # Already exists — update durationSeconds + audioSrc

public/
├── characters/
│   ├── ramona.webp                # ✅ exists
│   ├── rafal.webp                 # ✅ exists
│   ├── miyu.webp                  # ❌ TODO: create
│   └── luna.webp                  # ❌ TODO: create
└── demo-calls/
    ├── ramona.mp3                 # ✅ exists (7.85 s, 96 KB)
    ├── miyu.mp3                   # ❌ TODO: convert from .wav (18.90 s)
    ├── luna.mp3                   # ❌ TODO: convert from .wav (11.90 s)
    └── rafal.mp3                  # ❌ TODO: convert from .wav (18.84 s)
```
