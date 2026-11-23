# Agent Note: Docs deploy skip and committed OpenAPI spec

Status: implemented — docs builds skip unchanged commits and read a committed spec

## Problem

The docs Vercel project built on every push unless the commit subject carried
`[skip docs]`, `[skip deploy]`, or `[skip ci]`. Most pushes only change the web
app, so marking them by hand was easy to forget.

The docs API reference fetched its spec from `https://sexyvoice.ai/api/v1/openapi`
at build time. On a push to `main`, both projects build in parallel, and the docs
build fetches the spec before the new web build goes live. A spec change
therefore reached the docs only on a later docs deploy.

## Decision

- `apps/docs/vercel.json` keeps the commit-message markers as a manual override.
  Otherwise it runs `npx -y turbo-ignore @sexyvoice/docs --fallback=HEAD^1`,
  which diffs against `VERCEL_GIT_PREVIOUS_SHA` (the last successful deployment).
  It uses `npx` because the ignore step runs before dependencies are installed.
- The docs read the spec from
  `apps/docs/content/docs/api-reference/openapi.json`.
  `apps/web/tests/api-v1-openapi-docs-spec.test.ts` compares it with
  `createExternalApiOpenApiDocument()` through `toMatchFileSnapshot`, and
  `-u` rewrites it. A spec change becomes a docs change in git, so
  `turbo-ignore` builds the docs without a special case for web paths.

## Alternatives considered

- **Add `apps/web/lib/api/**` to the docs skip check.** Rejected: the docs
  build would still fetch the old spec from production.
- **Trigger a docs Deploy Hook from a GitHub Action after the web production
  deploy.** Rejected: it adds a workflow, a secret, and logic that depends on
  deploy timing, and PR previews would still show the old spec.
- **Vercel's "Skip deployments when there are no changes to the root directory
  or its dependencies" setting.** Rejected: it lives in the dashboard rather
  than the repo, and it can't read the commit-message markers.

## Consequences

- Web-only pushes skip the docs build without a marker. Checked locally:
  `turbo-ignore` skipped `97743d47` and `2e895b33` (web only) and built
  `69878437` (touches `apps/docs/content`).
- PR preview deploys of the docs show API changes before they ship.
- Changing the OpenAPI output means committing the refreshed `openapi.json`;
  the test fails until you do.
- A shallow Vercel clone that lacks the previous SHA makes `turbo-ignore`
  build, so failure modes build instead of skipping.
- Changes to root files that turbo treats as global inputs, such as
  `turbo.json`, still trigger a docs build.
