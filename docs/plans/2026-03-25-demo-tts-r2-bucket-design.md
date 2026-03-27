# Demo TTS R2 Bucket Split — Design

**Date:** 2026-03-25
**Status:** Approved

## Overview

The homepage demo TTS route should keep returning the existing JSON payload:

```json
{ "audioUrl": "https://...", "remaining": 2 }
```

The only behavioral change is where demo audio is stored. Instead of writing
demo files into the default `R2_BUCKET_NAME`, the route should upload to a
dedicated demo bucket and use a dedicated public base URL.

## Goals

- Isolate anonymous demo assets from primary product storage
- Make demo retention easy to manage with a bucket-level lifecycle rule
- Preserve the existing frontend contract and avoid client changes
- Keep the implementation aligned with the existing `/api/v1/speech` pattern

## Recommended Approach

Reuse the existing `uploadFileToR2()` helper and pass explicit storage
configuration from `app/api/demo-tts/route.ts`.

Required environment variables:

- `R2_DEMO_BUCKET_NAME`
- `R2_DEMO_PUBLIC_URL`

The route should fail with a server error if either variable is missing. This
prevents accidental fallback to the default bucket or default public URL.

## Data Flow

1. Validate request, ALTCHA payload, and rate limits
2. Validate the selected public Gemini voice
3. Validate `R2_DEMO_BUCKET_NAME` and `R2_DEMO_PUBLIC_URL`
4. Generate audio with Gemini TTS
5. Upload `demo-audio/*` to the dedicated demo bucket
6. Return the uploaded `audioUrl` and remaining demo count

## Operations

Configure a Cloudflare R2 lifecycle rule on the demo bucket to delete demo
objects after 7 days. No application-level cleanup job is required for this
change.
