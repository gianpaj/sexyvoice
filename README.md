<p align="center">
  <a href="https://sexyvoice.ai">
  <img alt="SexyVoice.ai Chatbot" src="./public/sexyvoice.ai-og-image.jpg" width="640">
  <h1 align="center">SexyVoice.ai Chatbot</h1>
  </a>
</p>

<p align="center">
  The last girlfriend you'll need
</p>

- Roadmap: <https://sexyvoice.featurebase.app>

## Tech

- [Next.js](https://nextjs.org) App Router
- React Server Components (RSCs), Suspense, and Server Actions
- [Vercel AI SDK](https://sdk.vercel.ai/docs) for streaming chat UI
- Support for OpenAI (default), Anthropic, Cohere, Hugging Face, or custom AI chat models and/or LangChain
- [shadcn/ui](https://ui.shadcn.com)
  - Styling with [Tailwind CSS](https://tailwindcss.com)
  - [Radix UI](https://radix-ui.com) for headless component primitives
  - Icons from [Phosphor Icons](https://phosphoricons.com)
- Chat History, rate limiting, and session storage with [Vercel KV](https://vercel.com/storage/kv)
- [NextAuth.js](https://github.com/nextauthjs/next-auth) for authentication

## Running locally

You will need to use the environment variables [defined in `.env.example`](.env.example) to run Next.js AI Chatbot. It's recommended you use [Vercel Environment Variables](https://vercel.com/docs/projects/environment-variables) for this, but a `.env` file is all that is necessary.

```bash
pnpm install
pnpm dev
```

Open [localhost:3000](http://localhost:3000/).
