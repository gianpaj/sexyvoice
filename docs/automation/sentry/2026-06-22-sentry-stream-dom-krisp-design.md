# Sentry Stream, DOM, and Krisp Fixes

Status: approved design

## Goal

Resolve three Sentry groups with direct, testable code-path evidence:

- `SEXYVOICE-AI-B0`: Gemini streams that complete without audio chunks.
- React DOM mutation groups, including `SEXYVOICE-AI-4R`.
- `SEXYVOICE-AI-B5`: Krisp's unsupported WebAssembly SIMD failure.

This change excludes `SEXYVOICE-AI-9Z` and `SEXYVOICE-AI-B3` because their root causes remain uncertain.

## Evidence

The Gemini stream route falls back to Gemini 2.5 only when the primary stream throws before emitting audio. A primary stream that completes with zero audio skips that fallback and reports `Gemini stream — no audio chunks`.

Representative DOM mutation events contain React commit and deletion frames without application frames. The client filter recognizes symbolicated React frame names, but `beforeSend` may receive minified frames before Sentry symbolicates them.

The Krisp issue reports `WebAssembly.Module(): ... Wasm SIMD unsupported` on Chrome 112. Krisp is optional; calls can continue without enhanced noise filtering.

## Design

### Gemini stream fallback

After the primary `tryStream` call, check whether it emitted audio. If it emitted none, raise a pre-audio failure inside the existing inner fallback block. The existing catch will retry with `gemini-2.5-flash-preview-tts`.

Do not raise the same failure after the fallback call. If both models emit no audio, preserve the existing Sentry capture and SSE error response. Billing, storage, and cache updates remain after successful audio generation.

### React DOM filtering

Keep the exact DOM mutation message allowlist. Drop a matching exception when one of these conditions holds:

- it has no stack frames;
- a frame identifies React commit or deletion internals; or
- no frame identifies application code.

Preserve matching errors with application frames and no React-internal evidence. This rule prevents broad message-only suppression from hiding app-owned DOM operations.

### Krisp compatibility noise

Classify `Wasm SIMD unsupported` as an expected Krisp/browser capability failure in both layers that handle this condition:

- `isExpectedKrispNoiseFilterError` ignores a rejected Krisp enable operation;
- the Sentry client filter drops an uncaught browser-level event when it has no application frames.

Do not add a custom WebAssembly feature probe. The exact error classification is smaller and avoids maintaining binary feature-detection code.

## Tests

Add focused coverage that proves:

- a zero-chunk Gemini 3.1 stream retries Gemini 2.5 and succeeds without billing twice;
- a second zero-chunk stream preserves the final error and skips billing;
- exact DOM mutation errors with unsymbolicated non-app frames are dropped;
- similar DOM errors with app frames remain reportable;
- Krisp recognizes the SIMD error as expected;
- Sentry drops the SIMD event without app frames and preserves it with app frames.

Run the three focused test files, the web test suite, `pnpm fixall`, and `pnpm type-check`.

## Operational Impact

The Gemini change adds at most one provider request when Gemini 3.1 returns no audio before streaming starts. Successful fallback uses the existing persistence and billing path. The filtering changes affect telemetry only and preserve errors tied to application frames.
