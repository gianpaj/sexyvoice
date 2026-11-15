# SexyVoice.ai Documentation

Documentation for [SexyVoice.ai](https://sexyvoice.ai), an AI voice platform,
built with [Fumadocs](https://fumadocs.dev) on Next.js.

Use [GLOSSARY.md](../../GLOSSARY.md) for domain names and definitions.

**Live docs:** [docs.sexyvoice.ai](https://docs.sexyvoice.ai)

## Development

```bash
pnpm --filter @sexyvoice/docs dev
```

Open http://localhost:3000.

## Structure

- `content/docs/`: the MDX pages and their `meta.json` navigation files.
- `source.config.ts`: the Fumadocs MDX collections and frontmatter schema.
- `src/lib/source.ts`: the content source that pages, search and the LLM
  routes read.
- `src/lib/shared.ts`: the docs and web app origins, and the GitHub branch.

| Route                         | Description                                |
| ----------------------------- | ------------------------------------------ |
| `src/app/(docs)/[[...slug]]`  | The documentation pages.                   |
| `src/app/api/search/route.ts` | The search endpoint.                       |
| `src/app/api/chat/route.ts`   | The AI assistant endpoint.                 |
| `src/app/llms*`               | Markdown versions of the pages for agents. |
| `src/app/og`                  | Open Graph images.                         |
| `src/app/rss.xml/route.ts`    | The RSS feed at `/rss.xml`.                |

The API reference pages in `content/docs/api-reference/endpoints/` are
generated from the published OpenAPI schema:

```bash
pnpm --filter @sexyvoice/docs generate-openapi-docs
```
