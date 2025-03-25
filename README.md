<p align="center">
  <a href="https://sexyvoice.ai">
  <img alt="SexyVoice.ai Chatbot" src="./public/sexyvoice.ai-og-image.jpg" width="640">
  <h1 align="center">SexyVoice.ai</h1>
  </a>
</p>

<p align="center">
  AI Voice Generation Platform
</p>

- Roadmap: <https://sexyvoice.featurebase.app>

## Features

<!-- - Generate AI voices in multiple languages (English & Spanish) -->
- Voice selection system with customizable options
- Public library of generated voices ranked by usage and votes
- Credit-based usage system
- User authentication and profile management (Google, Facebook and Apple login coming soon)

<!-- ## Back-end Python API -->

<!-- - [OpenVoice](https://github.com/myshell-ai/OpenVoice) running on [Hyperstack](https://www.hyperstack.cloud/) -->

## Tech Stack

- [Next.js](https://nextjs.org) App Router with TypeScript
- React Server Components (RSCs), Suspense, and Server Actions
- [Supabase](https://supabase.com) for authentication and database (with SSR support)
- [Drizzle ORM](https://orm.drizzle.team) for type-safe database operations (TODO)
- [Vercel Blob Storage](https://vercel.com/storage/blob) for audio file storage
- [shadcn/ui](https://ui.shadcn.com)
  - Styling with [Tailwind CSS](https://tailwindcss.com)
  - [Radix UI](https://radix-ui.com) for headless component primitives
- Internationalization (i18n) support for English and Spanish
- Rate limiting and usage tracking

## Running locally

You will need to use the environment variables [defined in `.env.example`](.env.example) to run the application. It's recommended you use [Vercel Environment Variables](https://vercel.com/docs/projects/environment-variables) for this, but a `.env` file is all that is necessary.

```bash
pnpm install
pnpm dev
```

Open [localhost:3000](http://localhost:3000/).


## Migrations

```bash
supabase db push
```

## Tests

```bash
npx tsx --test --watch lib/utils.test.ts
```
