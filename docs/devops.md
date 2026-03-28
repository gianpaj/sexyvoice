# prod server locations

- supabase: eu-west-3
- redis upstash: us-west-2 (oregon)
- livekit python server on fly.io: paris CDG

## Storage

- R2 buckets
  - `sv-audio-files`: Eastern North America (ENAM) - for Cloned and Generated audio files
  - `sv-api-speech-audio-files`: Eastern North America (ENAM) - for external API Speech audio files

## Vercel

- eu-west-3 - cdg1
- us-east-1 - iad1
- us-west-1 - sfo1

## Sentry

### Configuration

- **Org**: `sexyvoiceai`
- **Project**: `sexyvoice-ai`
- Sentry is configured in `next.config.js` via `@sentry/nextjs`
- Client errors are tunneled through `/monitoring` to bypass ad-blockers
- Source maps are uploaded only in production (`VERCEL_ENV=production`)

### CLI setup

`sentry-cli` authenticates via `~/.sentryclirc` (contains an auth token).
Verify with:

```bash
sentry-cli info
```

### Common commands

List issues:

```bash
sentry-cli issues --org sexyvoiceai --project sexyvoice-ai list
```

Filter by status:

```bash
sentry-cli issues --org sexyvoiceai --project sexyvoice-ai -s unresolved list
```

Bulk resolve/mute:

```bash
sentry-cli issues --org sexyvoiceai --project sexyvoice-ai -i <ISSUE_ID> resolve
sentry-cli issues --org sexyvoiceai --project sexyvoice-ai -i <ISSUE_ID> mute
```

### Fetching event details via the API

`sentry-cli` does not support listing individual events. Use the Sentry REST
API directly with the auth token from `~/.sentryclirc`:

```bash
TOKEN=$(grep token ~/.sentryclirc | cut -d= -f2)

# List events for an issue (use the numeric issue ID, not the short ID)
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://sentry.io/api/0/organizations/sexyvoiceai/issues/<ISSUE_ID>/events/?full=true&limit=100"
```

The response is a JSON array of event objects. Useful fields:

- `dateCreated` — event timestamp
- `tags` — array of `{key, value}` pairs (includes `url`, `browser`,
  `browser.name`, `os`, `os.name`, `device.family`, `transaction`)
- `contexts.device` — device family, model, brand
- `contexts.browser` — browser name and version
- `contexts.os` — OS name and version
- `entries` — array containing `breadcrumbs` (with navigation history),
  `exception` (stack traces), and `request` data
- `user` — user ID and IP (may be `null` depending on privacy settings)

To extract a summary table from all events, pipe the JSON through a script:

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://sentry.io/api/0/organizations/sexyvoiceai/issues/<ISSUE_ID>/events/?full=true&limit=100" \
  | python3 -c "
import json, sys
events = json.load(sys.stdin)
for e in events:
    tags = {t['key']: t['value'] for t in e.get('tags', [])}
    print(f\"{e['dateCreated']}  {tags.get('browser', '?')}  {tags.get('os', '?')}  {tags.get('device.family', '?')}  {tags.get('url', '?')}\")
"
```

### Finding the numeric issue ID

The Sentry UI uses short IDs like `SEXYVOICE-AI-6C`. The numeric ID is
visible in the URL when viewing the issue in the Sentry dashboard, or in the
output of `sentry-cli issues list` (first column).

## Troubleshooting Checklist

### OAuth callback/session issues

Check:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OAUTH_CALLBACK_MARKER_SECRET`
- redirect URL configuration in Supabase / OAuth provider
- Sentry events tagged for OAuth callback flow

### LiveKit call issues

Check:
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- that `/api/call-token` can mint tokens successfully
- that the LiveKit agent name and room dispatch configuration match the deployed agent setup

### External API issues

Check:
- `API_KEY_HMAC_SECRET`
- `R2_SPEECH_API_BUCKET_NAME`
- `R2_SPEECH_API_PUBLIC_URL`
- Axiom logs
- rate limiting / Redis connectivity

### Gemini / voice generation issues

Check:
- `GOOGLE_GENERATIVE_AI_API_KEY`
- `GOOGLE_GENERATIVE_AI_API_KEY_SECONDARY`
- provider quotas
- request logs
- R2 upload configuration

### Storage issues

Check:
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_ENDPOINT`
- bucket CORS configuration if browser fetches are involved

## Documentation Maintenance Rules

When environment or deployment behavior changes:

1. Update [`.env.example`](../.env.example)
2. Update [`README.md`](../README.md)
3. Update [`AGENTS.md`](../AGENTS.md)
4. Update this file if the change affects:
   - deployment
   - infra
   - runtime behavior
   - secret management
   - region placement
   - operational troubleshooting

Keeping these docs synchronized prevents setup drift between development,
deployment, and operational troubleshooting.
