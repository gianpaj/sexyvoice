# SexyVoice External API

After reviewing various API specs, including the MiniMax T2A spec alongside OpenAI's Create Speech API and the current SexyVoice codebase, here are concrete recommendations to improve the plan. I've organized them by what to adopt, what to skip, and what to modify.

---

### Best Practices to Adopt from MiniMax

#### 1. Structured Error Response with Status Codes

MiniMax uses a `base_resp` object with numeric `status_code` and `status_msg`. This is better than returning just an `error` string. The current plan's `ErrorResponseSchema` should be enhanced:

**Current plan:**

```json
{ "error": "Invalid request body", "code": "invalid_request" }
```

**Recommended (hybrid of MiniMax + OpenAI):**

```json
{
  "error": {
    "message": "The input text exceeds the maximum length of 1000 characters",
    "type": "invalid_request_error",
    "param": "input",
    "code": "input_too_long"
  }
}
```

This follows OpenAI's pattern (nested `error` object with `message`, `type`, `param`, `code`) which is more informative than MiniMax's numeric codes while being more developer-friendly. The `param` field is particularly valuable -- it tells the developer exactly which parameter caused the error.

**Concrete error codes to define:**

| Code                       | HTTP Status | Description                    |
| -------------------------- | ----------- | ------------------------------ |
| `invalid_api_key`          | 401         | Missing or invalid API key     |
| `api_key_expired`          | 403         | API key has expired            |
| `api_key_inactive`         | 403         | API key has been revoked       |
| `insufficient_credits`     | 402         | Not enough credits             |
| `invalid_request_error`    | 400         | General validation failure     |
| `input_too_long`           | 400         | Text exceeds character limit   |
| `voice_not_found`          | 404         | Voice ID/name doesn't exist    |
| `model_not_found`          | 400         | Invalid model name             |
| `content_policy_violation` | 422         | Text flagged by content filter |
| `rate_limit_exceeded`      | 429         | Too many requests              |
| `server_error`             | 500         | Internal failure               |

#### 2. Usage Tracking in Response

MiniMax returns `usage_characters` in the response. The current plan already includes `credits_used` and `credits_remaining`, but should also add:

```json
{
  "url": "https://...",
  "credits_used": 48,
  "credits_remaining": 952,
  "cached": false,
  "usage": {
    "input_characters": 150,
    "model": "gpro"
  }
}
```

This helps developers track and predict costs. OpenAI similarly returns usage info in their chat completions API.

#### 3. OpenAPI 3.1.0 (not 3.0.0)

MiniMax uses OpenAPI 3.1.0 which supports JSON Schema 2020-12 natively. The current plan specifies 3.0.0. Upgrade to **3.1.0** since:

- Better alignment with modern JSON Schema (which Zod schemas map to more naturally)
- `null` types handled correctly
- SexyVoice is a new API, so no backwards-compatibility concerns

#### 4. Multiple Request Examples in OpenAPI Spec

MiniMax provides multiple `examples` for the same endpoint (e.g., "Text Input" and "File Input"). The current plan has examples but should provide at least 3:

```yaml
examples:
  basic:
    summary: "Basic voice generation"
    value:
      model: "gpro"
      input: "Hello, world!"
      voice: "kore"
  with_style:
    summary: "Voice generation with emotion"
    value:
      model: "gpro"
      input: "This is amazing news!"
      voice: "tara"
      style: "happy"
  minimal:
    summary: "Minimum required parameters"
    value:
      model: "kokoro"
      input: "Test"
      voice: "pietro"
```

#### 5. Speed Parameter

Both MiniMax (`speed: [0.5, 2]`) and OpenAI (`speed: [0.25, 4.0]`) support a `speed` parameter. SexyVoice doesn't currently expose this, but the plan's `VoiceGenerationRequestSchema` should include it for future use:

```ts
speed: z.number()
  .min(0.5)
  .max(2.0)
  .optional()
  .default(1.0)
  .describe("Speech speed multiplier. Range: [0.5, 2.0], default: 1.0");
```

Even if it's not implemented immediately, having it in the schema makes the API forward-compatible. Return a `400` with a clear message if a non-default speed is provided but not yet supported.

---

### Best Practices to Adopt from OpenAI (reinforcing the current plan)

#### 6. Binary Audio Streaming Response (Optional Enhancement)

OpenAI returns **raw binary audio** rather than a JSON wrapper with a URL. This is the gold standard for TTS APIs because:

- No base64 overhead (~33% savings)
- Enables streaming playback
- Standard HTTP content negotiation

**Recommendation:** Keep the current JSON+URL approach as default, but add support for a `stream` parameter or `Accept: audio/*` header for clients that want direct binary:

```
# URL response (default)
POST /api/v1/speech
Content-Type: application/json
-> { "url": "...", "credits_used": 48, ... }

# Stream response (future enhancement)
POST /api/v1/speech
Accept: audio/wav
-> Binary WAV data streamed directly
```

This can be a v1.1 enhancement. Document it as "coming soon" in the OpenAPI spec.

#### 7. Minimal Required Fields

OpenAI requires only `model`, `input`, `voice`. The current plan matches this. Keep it -- progressive disclosure is important for developer adoption.

---

### What NOT to Adopt from MiniMax

#### 8. Skip Async Task Pattern

MiniMax uses an async `task_id` + polling pattern (`t2a_async_v2`). This adds complexity and is unnecessary for SexyVoice because:

- SexyVoice's text limits are 500-1000 chars (MiniMax supports up to 50,000-100,000)
- Generation is fast enough for synchronous response
- The Redis cache makes repeat requests instant
- OpenAI's TTS is also synchronous

**Keep the synchronous approach in the plan.**

#### 9. Skip Voice Modification Parameters

MiniMax has `voice_modify` with pitch/intensity/timbre/sound_effects. These are model-specific capabilities that SexyVoice's underlying providers (Gemini, Replicate) don't currently support at the API level. Adding them would create a misleading API surface.

**Only expose parameters that the backend actually supports.** The `style` parameter (emotion/style variant) already covers what's available.

#### 10. Skip Pronunciation Dictionaries

MiniMax's `pronunciation_dict` is a specialized feature for CJK languages. Not applicable to SexyVoice's current voice models.

#### 11. Skip Audio Settings (sample_rate, bitrate, channel)

MiniMax exposes `audio_setting` with sample rate, bitrate, and channel configuration. SexyVoice's backend produces fixed-format output:

- Gemini voices: WAV (single format)
- Replicate voices: MP3 (single format)

Don't expose settings the backend can't fulfill. The `response_format` field in the current plan is sufficient for now and could be expanded later when the backend supports format conversion.

---

### Specific Plan Updates Recommended

#### 12. Update `VoiceGenerationRequestSchema` in `lib/api/schemas.ts`

```ts
export const VoiceGenerationRequestSchema = z.object({
  model: z.enum(["gpro", "kokoro"]).describe("The voice model to use"),
  input: z
    .string()
    .min(1)
    .max(1000)
    .describe("The text to synthesize (max 1000 chars for gpro, 500 for kokoro)"),
  voice: z
    .string()
    .min(1)
    .describe("The voice name to use (see GET /api/v1/voices for available voices)"),
  response_format: z
    .enum(["wav", "mp3"])
    .optional()
    .describe("Audio format. Default depends on model: wav for gpro, mp3 for kokoro"),
  speed: z
    .number()
    .min(0.5)
    .max(2.0)
    .optional()
    .default(1.0)
    .describe("Speech speed multiplier. Range: [0.5, 2.0]"),
  style: z
    .string()
    .optional()
    .describe(
      'Emotion/style variant (e.g., "happy", "sad", "whisper"). Available styles vary by voice.',
    ),
});
```

#### 13. Update `VoiceGenerationResponseSchema`

```ts
export const VoiceGenerationResponseSchema = z.object({
  url: z.string().url().describe("URL to the generated audio file"),
  credits_used: z.number().int().nonnegative().describe("Credits consumed for this generation"),
  credits_remaining: z.number().int().nonnegative().describe("Remaining credits in account"),
  cached: z.boolean().describe("Whether result was served from cache"),
  usage: z
    .object({
      input_characters: z.number().int().describe("Number of input characters processed"),
      model: z.string().describe("Model used for generation"),
    })
    .describe("Usage details for billing tracking"),
});
```

#### 14. Update `ErrorResponseSchema`

```ts
export const ErrorResponseSchema = z.object({
  error: z.object({
    message: z.string().describe("Human-readable error description"),
    type: z
      .enum([
        "invalid_request_error",
        "authentication_error",
        "permission_error",
        "not_found_error",
        "rate_limit_error",
        "server_error",
      ])
      .describe("Error category"),
    param: z
      .string()
      .nullable()
      .optional()
      .describe("The parameter that caused the error, if applicable"),
    code: z.string().describe("Machine-readable error code"),
  }),
});
```

#### 15. Add Rate Limit Headers to All API Responses

Following both OpenAI and MiniMax patterns, include standard rate limit headers:

```
X-RateLimit-Limit-Requests: 60
X-RateLimit-Remaining-Requests: 55
X-RateLimit-Reset-Requests: 2026-02-09T12:00:00Z
```

Even if rate limiting isn't enforced in v1, return these headers with generous defaults. This sets expectations and makes the transition seamless when rate limiting is added later.

#### 16. Add `GET /api/v1/models` Endpoint

Both OpenAI and MiniMax have model listing capabilities. Add a simple endpoint:

```json
GET /api/v1/models
{
  "data": [
    {
      "id": "gpro",
      "name": "GPro (Gemini)",
      "max_input_length": 1000,
      "supported_formats": ["wav"],
      "supported_styles": ["happy", "sad", "angry", "whisper"]
    },
    {
      "id": "kokoro",
      "name": "Kokoro (Replicate)",
      "max_input_length": 500,
      "supported_formats": ["mp3"],
      "supported_styles": []
    }
  ]
}
```

This helps developers discover available capabilities programmatically without reading docs.

#### 17. OpenAPI Spec: Use `zod-openapi` Instead of Manual Conversion

The current plan has a `zodToOpenAPI()` helper that's described as "simplified." Use the [`zod-openapi`](https://www.npmjs.com/package/zod-openapi) library instead of writing a manual converter. This ensures the OpenAPI spec stays in sync with the Zod schemas automatically and handles edge cases like `optional()`, `default()`, and `describe()`.

---

### Summary of Recommended Plan Changes

| #   | Change                                                 | Priority | Reason                                            |
| --- | ------------------------------------------------------ | -------- | ------------------------------------------------- |
| 1   | Structured error response with `type`, `param`, `code` | High     | Developer experience, debugging                   |
| 2   | Add `usage.input_characters` to response               | Medium   | Cost prediction for developers                    |
| 3   | Upgrade OpenAPI to 3.1.0                               | Low      | Modern standard, better Zod compatibility         |
| 4   | Multiple request examples in OpenAPI spec              | Medium   | Better documentation                              |
| 5   | Add `speed` parameter (optional, future)               | Low      | Forward compatibility                             |
| 6   | Keep synchronous (skip async task pattern)             | High     | Simplicity, SexyVoice's text limits don't need it |
| 7   | Skip voice modification params                         | High     | Don't expose what backend can't do                |
| 8   | Rate limit headers in responses                        | Medium   | Future-proofing                                   |
| 9   | Add `GET /api/v1/models` endpoint                      | Medium   | Discoverability                                   |
| 10  | Use `zod-openapi` library                              | Medium   | Reliable schema conversion                        |

The current plan is well-structured. These changes refine it by incorporating the best patterns from both OpenAI and MiniMax while avoiding the complexity that doesn't apply to SexyVoice's current capabilities.

---

## Additional Requirements for User-Facing External API

To make the external API production-ready for end users, add API key lifecycle
management in DB, backend auth, and dashboard UI.

### 1. Database: `api_keys` table + migration

- Create migration:
  `supabase/migrations/20260302170000_create_api_keys_table.sql`
- Table columns:
  - `id` UUID primary key
  - `user_id` UUID references `auth.users(id)` with `ON DELETE CASCADE`
  - `key_hash` TEXT UNIQUE (SHA-256 hash only, never store raw key)
  - `key_prefix` VARCHAR(12) (display identifier, e.g. `sk_live_abc1`)
  - `name` TEXT (user-provided description)
  - `created_at` TIMESTAMPTZ
  - `last_used_at` TIMESTAMPTZ nullable
  - `expires_at` TIMESTAMPTZ nullable
  - `is_active` BOOLEAN default true
  - `permissions` JSONB (future scopes)
  - `metadata` JSONB (future extensibility)

### 2. RLS + function

- Enable RLS for `api_keys`.
- Add policies so authenticated users can only `SELECT/INSERT/UPDATE/DELETE`
  their own keys (`auth.uid() = user_id`).
- Add function:
  `update_api_key_last_used(p_key_hash TEXT)` to update `last_used_at` for valid
  keys.
- Restrict function execution to `service_role`.

### 3. API key auth implementation (`lib/api/auth.ts`)

- Implement:
  - `generateApiKey(): { key; hash; prefix }`
  - `hashApiKey(key: string): string`
  - `validateApiKey(authHeader: string)` returning
    `{ userId; apiKeyId; keyHash } | null`
  - `updateApiKeyLastUsed(keyHash: string): Promise<void>`
- Key format:
  - `sk_live_` + 32 alphanumeric chars
  - Prefix storage: first 12 chars
  - Store only hash in DB

### 4. Dashboard UI

- Add key management UI at:
  `app/[lang]/(dashboard)/dashboard/profile/api-keys.tsx`
- Allow users to:
  - list keys
  - create key (show raw key once)
  - revoke/deactivate key

### 5. External API updates

- Update `/api/v1/*` routes to authenticate via bearer API key from DB (not env).
- Apply Redis-backed rate limiting per API key hash.
- Return rate-limit headers from live limiter state.
- Update external API tests for bearer auth + DB key validation + Redis limiter.

### 6. Billing usage analytics

- Extend `usage_events` to track API usage dimensions:
  - `api_key_id`, `model`, `input_chars`, `output_chars`,
    `duration_seconds`, `dollar_amount`
- Add a server-side pricing function (hardcoded map for now) to compute
  `dollar_amount` by `source_type + provider + model`.
- Future step: move pricing map to DB table for versioned pricing changes.
- Add external API-specific source types:
  - `api_tts`
  - `api_voice_cloning` (future external cloning endpoint)
- Emit usage events from all `/api/v1/*` routes with these new source types.
- Add daily aggregate view:
  - `public.api_usage_daily`
- Add billing query route:
  - `GET /api/billing/usage`
  - Supports:
    - `starting_on`
    - `ending_before`
    - `bucket_width` (`1d`, `7d`)
    - `group_by` (`source_type`, `api_key_id`, `model`)
    - optional filters (`source_type`, `api_key_id`)
- Sync billing date/group params with page search params in dashboard UI.
