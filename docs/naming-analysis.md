# Naming Analysis

Convention rules:
- **snake_case** for fields that cross the Python backend boundary (API request/response shapes, DB column names)
- **camelCase** for everything else (TypeScript variables, functions, classes, internal state)
- **UPPER_SNAKE_CASE** for module-level constants
- **PascalCase** for types and interfaces

---

## Critical

### 1. Duplicate conflicting fields in `ApiCharacterResponse`
**Files:** `lib/characters.ts:14-17`

The API response interface declares both camelCase and snake_case variants of the same fields. Both are read in the mapper with `??` fallback, meaning whichever value the API happens to include wins silently. The snake_case variants are correct here since this is a raw API response shape.

```ts
// Before
session_config?: {
  maxOutputTokens?: number | null;   // camelCase — wrong for API response shape
  max_output_tokens?: number | null; // snake_case — correct, but duplicate
  grokImageEnabled?: boolean;        // camelCase — wrong for API response shape
  grok_image_enabled?: boolean;      // snake_case — correct, but duplicate
}

// After — keep only snake_case in the API response interface
session_config?: {
  max_output_tokens?: number | null;
  grok_image_enabled?: boolean;
}
// The mapper already reads both via ??, update it to read only snake_case
```

**Status:** [x] Fixed

---

## Major

### 2. `pgState` — opaque abbreviation
**Files:** `hooks/use-playground-state.tsx:285,391`, `hooks/use-connection.tsx:25,52`

`pg` is ambiguous (PostgreSQL? page? playground?). No reason to abbreviate.

```ts
// Before
interface PlaygroundStateContextProps {
  pgState: PlaygroundState;
  ...
}
// and at every call site:
const { pgState, dispatch, helpers } = usePlaygroundState();

// After
interface PlaygroundStateContextProps {
  playgroundState: PlaygroundState;
  ...
}
const { playgroundState, dispatch, helpers } = usePlaygroundState();
```

**Status:** [x] Fixed

### 3. `resolveCharacterPrompt` — misleading name
**File:** `lib/supabase/queries.ts:103`

"resolve" implies async promise resolution or computing a value. The function actually fetches a full character record (id, voice, prompt) from the DB via admin client. The name also implies only a prompt is returned, but voice data is included too.

```ts
// Before
export async function resolveCharacterPrompt(characterId: string)

// After
export async function fetchCharacterDetails(characterId: string)
```

**Status:** [x] Fixed

### 4. `getFullInstructions` / `getStateWithFullInstructions` — confusingly similar
**File:** `lib/playground-state-helpers.ts:120,144`

Both names start identically. The difference — one returns a `string`, one returns a `PlaygroundState` — isn't visible in the name. Callers have to remember which is which.

```ts
// Before
getFullInstructions(state): string
getStateWithFullInstructions(state): PlaygroundState

// After
resolveActiveInstructions(state): string        // reads overrides, returns the string
buildStateWithResolvedInstructions(state): PlaygroundState  // returns full updated state
```

**Status:** [x] Fixed

### 5. `newState` / `baseState` / `mergedInitialState` — three naming styles for the same concept
**Files:** `hooks/use-playground-state.tsx:178,320,325`, `lib/playground-state-helpers.ts:157`

All three are "a modified copy of state", but use different vocabulary. `newState` is also mutated after creation (lines 189, 199) which is surprising for a `const`.

```ts
// Before
const newState = { ...state, selectedPresetId: action.payload };
newState.instructions = ...;  // mutation after declaration — surprising
newState.sessionConfig = ...;
const baseState = preset ? { ...state, sessionConfig: preset.sessionConfig } : state;
const mergedDefaultPresets = defaultPresetsProp ?? [];
const mergedInitialState: PlaygroundState = ...

// After
// In the reducer, build the final object in one shot instead of mutating:
const updatedState: PlaygroundState = {
  ...state,
  selectedPresetId: action.payload,
  instructions: resolvedInstructions,
  sessionConfig: selectedPreset?.sessionConfig || defaultSessionConfig,
};
// In the helpers:
const stateWithPresetConfig = preset ? { ...state, sessionConfig: preset.sessionConfig } : state;
// In the provider:
const resolvedDefaultPresets = defaultPresetsProp ?? [];
const resolvedInitialState: PlaygroundState = ...
```

**Status:** [x] Fixed

---

## Minor

### 6. `dm` in `formatBytes` — single-letter abbreviation
**File:** `hooks/use-file-upload.ts:411`

```ts
// Before
const dm = decimals < 0 ? 0 : decimals;
// used as: .toFixed(dm)

// After
const clampedDecimals = decimals < 0 ? 0 : decimals;
// used as: .toFixed(clampedDecimals)
```

**Status:** [x] Fixed

### 7. `i` as magnitude index in `formatBytes`
**File:** `hooks/use-file-upload.ts:414`

`i` reads as a loop counter but this is a byte-magnitude calculation result.

```ts
// Before
const i = Math.floor(Math.log(bytes) / Math.log(k));
return Number.parseFloat((bytes / k ** i).toFixed(dm)) + sizes[i];

// After
const magnitudeIndex = Math.floor(Math.log(bytes) / Math.log(k));
return Number.parseFloat((bytes / k ** magnitudeIndex).toFixed(clampedDecimals)) + sizes[magnitudeIndex];
```

**Status:** [x] Fixed

### 8. Magic number constant names lack unit context
**File:** `lib/supabase/constants.ts:3-4`

`MINIMUM_CREDITS_FOR_CALL` and `CREDITS_PER_MINUTE` — what kind of credits? per what type of call? Adding the domain to the names makes them self-documenting.

```ts
// Before
export const MINIMUM_CREDITS_FOR_CALL = 999;
export const CREDITS_PER_MINUTE = 2000;

// After
export const MIN_CREDITS_TO_START_CALL = 999;
export const CREDITS_PER_CALL_MINUTE = 2000;
```

All references to `MINIMUM_CREDITS_FOR_CALL` and `CREDITS_PER_MINUTE` must be updated accordingly.

**Status:** [x] Fixed
