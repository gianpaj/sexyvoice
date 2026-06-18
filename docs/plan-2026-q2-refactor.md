› now that you have looked at the code and see how it's waeaved, what longer term
  architectual decisions should we make together to make this platform scale from a
  performance point of view but also to allow more developers and agents to code better
  together. we'll add more features to both the app/api/generate-voice/route.ts API and
  app/api/v1/speech/route.ts

  take your time. think hard

<!-- gpt-5.3-codex -->

• Recommended Long-Term Decisions

1. Create a single Voice Generation Domain layer

    - Move route logic from both app/api/generate-voice/route.ts and app/api/v1/speech/
      route.ts into one orchestrator service (for validation, pricing, credits, provider
      execution, caching, persistence).
    - Keep routes as thin adapters (auth + request mapping + response mapping).
    - Result: one place to change behavior, fewer regressions, easier parallel work by
      humans/agents.

2. Adopt provider adapters with a strict interface

    - Define VoiceProvider contract: synthesize(input): ProviderResult.
    - Implement adapters for Gemini/Replicate/fal/etc.
    - Route-independent provider fallback policy lives in orchestrator.
    - Result: adding providers/models becomes additive, not copy-paste.

3. Introduce an append-only api_requests ledger

    - Store every request attempt (success/failure) with request_id, route, auth
      principal, payload hash, provider, latency, error code, status code, and cost
      snapshot.
    - Keep usage_events focused on billing-relevant consumption; link
      usage_events.request_id -> api_requests.request_id.
    - Result: reliable debugging, analytics, abuse detection, and future replay/backfill.

4. Add idempotency + in-flight dedupe

    - Support optional Idempotency-Key for external API.
    - Use Redis lock/in-flight key on normalized hash to prevent duplicate provider calls
      under retry storms.
    - Result: lower cost and lower provider load at scale.

5. Split synchronous vs asynchronous generation paths

    - Keep fast path sync for short requests.
    - Add queued async path for expensive/long jobs with job status endpoint/webhook.
    - Result: predictable latency and better throughput under spikes.

6. Unify pricing + quota + entitlement engine

    - Central service for credits, dollar pricing, model pricing versions, free/paid
      limits, and per-key/per-user quotas.
    - Persist pricing version on each request record.
    - Result: safe future pricing changes and reproducible billing.

7. Centralize API error taxonomy and contract governance

    - Keep one external error catalog (already started), add stable docs page generated
      from source.
    - Enforce error-code compatibility tests.
    - Result: API clients stay stable as features grow.

8. Harden caching strategy

    - Canonical cache key schema:
      `model+voice+input+style+seed+providerVersion+outputFormat`.
    - Include “cacheability policy” by model/provider.
    - Track hit/miss and stale metrics.
    - Result: better cache correctness and measurable performance wins.

9. Observability baseline (SLO-ready)

    - Standard structured logs with request_id everywhere.
    - Metrics per route/provider/model: p50/p95 latency, fail rate, queue depth, cost/
      request, cache hit rate.
    - Sentry traces linked by request_id.
    - Result: actionable scaling decisions instead of guesswork.

10. Developer/agent scaling model

    - Define clear module boundaries and ownership:
        - lib/voice-core (domain orchestration)
        - lib/voice-providers/*
        - lib/billing/*
        - lib/api-contract/*
    - Add ADRs for every cross-cutting decision (rate limit, idempotency, pricing,
      retries).
    - Add contract tests + fixture tests that both routes must pass.
    - Result: multiple developers/agents can ship in parallel safely.

———

Suggested rollout order

1. Extract shared orchestrator + provider interfaces.
2. Add `api_requests` ledger and link `usage_events` by request_id.
3. Add idempotency/in-flight dedupe.
4. Introduce async job path.
5. Move pricing to versioned engine and tighten SLO dashboards.

If you want, I can draft the concrete target folder structure and first ADR set so we
can start implementing this incrementally without a risky big-bang rewrite.
