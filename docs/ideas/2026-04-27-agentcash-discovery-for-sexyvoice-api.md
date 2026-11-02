# AgentCash Discovery for SexyVoice API

## Context

AgentCash requires a server to expose `/openapi.json` with additional discovery fields so AI agents can find, understand, and pay for API endpoints. The existing OpenAPI spec lives at `/api/v1/openapi` and already documents the correct routes and schemas — it just needs AgentCash-specific extensions added and a new route at `/openapi.json`.

The key additions are:
- `info.x-guidance` — high-level agent-friendly description
- Top-level `x-discovery.ownershipProofs` — from `AGENTCASH_OWNERSHIP_PROOF` env var
- `x-payment-info` + 402 response on `POST /api/v1/speech` (the only paid endpoint)
- `siwx` security scheme on identity-gated read endpoints (voices, models, billing)
- `operationId` on each operation (required for reliable agent invocation)

## Files to Modify/Create

| File | Change |
|------|--------|
| `apps/web/lib/api/openapi.ts` | Add `createAgentCashOpenApiDocument()` function |
| `apps/web/app/openapi.json/route.ts` | **New** — GET handler serving AgentCash doc |

## Implementation

### 1. `apps/web/lib/api/openapi.ts` — add new export

Add `createAgentCashOpenApiDocument()` after the existing function. It calls `createExternalApiOpenApiDocument()` to get the base document, then merges AgentCash fields on top:

```typescript
export function createAgentCashOpenApiDocument() {
  const base = createExternalApiOpenApiDocument() as Record<string, unknown>;
  const basePaths = base.paths as Record<string, Record<string, unknown>>;
  const baseComponents = base.components as Record<string, unknown>;

  return {
    ...base,
    info: {
      ...(base.info as object),
      'x-guidance':
        'Use POST /api/v1/speech to convert text to audio (requires an API key as Bearer token). ' +
        'GET /api/v1/voices lists available voice names to pass in the voice field. ' +
        'GET /api/v1/models lists supported model IDs. ' +
        'GET /api/v1/billing returns your remaining credit balance. ' +
        'Obtain an API key at https://sexyvoice.ai/dashboard/api-keys.',
    },
    'x-discovery': {
      ownershipProofs: [process.env.AGENTCASH_OWNERSHIP_PROOF ?? ''],
    },
    components: {
      ...baseComponents,
      securitySchemes: {
        ...(baseComponents.securitySchemes as object),
        siwx: {
          type: 'http',
          scheme: 'bearer',
          description: 'AgentCash identity authentication (Sign-In With X)',
        },
      },
    },
    paths: {
      '/api/v1/speech': {
        post: {
          ...(basePaths['/api/v1/speech']?.post as object),
          operationId: 'generateSpeech',
          'x-payment-info': {
            price: { mode: 'dynamic', currency: 'USD', min: '0.001000', max: '0.100000' },
            protocols: [
              { x402: {} },
              { mpp: { method: '', intent: '', currency: '' } },
            ],
          },
        },
      },
      '/api/v1/voices': {
        get: {
          ...(basePaths['/api/v1/voices']?.get as object),
          operationId: 'listVoices',
          security: [{ siwx: [] }],
        },
      },
      '/api/v1/models': {
        get: {
          ...(basePaths['/api/v1/models']?.get as object),
          operationId: 'listModels',
          security: [{ siwx: [] }],
        },
      },
      '/api/v1/billing': {
        get: {
          ...(basePaths['/api/v1/billing']?.get as object),
          operationId: 'getBilling',
          security: [{ siwx: [] }],
        },
      },
    },
  };
}
```

> The 402 response on `/api/v1/speech` is already present in the base document (line 102–109 of openapi.ts) so no extra work needed there.

### 2. `apps/web/app/openapi.json/route.ts` — new file

Next.js App Router supports folder names with dots, so `app/openapi.json/route.ts` serves at `/openapi.json`.

```typescript
import { createAgentCashOpenApiDocument } from '@/lib/api/openapi';

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(createAgentCashOpenApiDocument(), {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  });
}
```

`force-dynamic` ensures the env var is read at runtime rather than baked in at build time.

## Environment Variable

Add to `.env.local` (and Vercel dashboard):
```
AGENTCASH_OWNERSHIP_PROOF=<your-proof-from-agentcash>
```

## Verification

1. Run local dev server: `pnpm dev`
2. Validate document structure:
   ```bash
   TARGET_URL=http://localhost:3000
   npx -y @agentcash/discovery@latest discover "$TARGET_URL"
   npx -y @agentcash/discovery@latest check "$TARGET_URL"
   ```
3. Confirm `/openapi.json` contains `x-payment-info` on the speech endpoint, `x-discovery`, and `x-guidance`.
4. Once passing locally, deploy to Vercel and re-run check against production URL.
5. Register on MppScan / X402Scan.
