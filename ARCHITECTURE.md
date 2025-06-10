# Architecture Overview

This document outlines the high level architecture of **SexyVoice.ai** and how data flows through the system.

## Key Components

- **Next.js App Router** – renders the frontend and hosts API routes.
- **Supabase** – provides authentication and PostgreSQL database.
- **Replicate** – generates voice audio from text.
- **Vercel Blob Storage** – stores generated audio files.
- **Upstash Redis** – caches audio URLs for repeated requests.
- **PostHog** – captures analytics events.
- **Sentry** – tracks errors and exceptions.

## Voice Generation Flow

```mermaid
flowchart TD
    user(User)
    client[Next.js Frontend]
    api[POST /api/generate-voice]
    supabase[Supabase auth & DB]
    redis[Upstash Redis]
    replicate[Replicate API]
    blob[Vercel Blob Storage]
    posthog[PostHog]
    sentry[Sentry]

    user --> client
    client --> api
    api --> supabase
    api --> redis
    redis -->|Hit| blob
    redis -->|Miss| replicate
    replicate --> blob
    blob --> redis
    blob --> api
    api --> posthog
    api --> sentry
    api --> supabase
    blob --> client
```

1. The frontend calls `POST /api/generate-voice` with the text and voice name.
2. The API route validates the request and checks user credits in **Supabase**.
3. The request hash is looked up in **Redis**; if found, the cached URL is returned.
4. Otherwise the route invokes **Replicate** to synthesize audio and uploads it to **Vercel Blob Storage**.
5. The blob URL is cached in **Redis** and stored in **Supabase** along with metadata and credit usage.
6. Analytics are sent to **PostHog** and any errors are logged in **Sentry**.
7. The API returns the final audio URL to the client.
