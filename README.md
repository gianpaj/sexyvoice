# SexyVoice.ai - AI Voice Generation Platform

<p align="center">
  <a href="https://sexyvoice.ai">
    <img alt="SexyVoice.ai - AI Voice Generation Platform" src="./public/sexyvoice.ai-og-image.jpg" width="640">
  </a>
</p>

<p align="center">
  <strong>Create stunning AI-generated voices and clone your own voice with advanced machine learning technology</strong>
</p>

<p align="center">
  <a href="https://sexyvoice.ai">🌐 Live Demo</a> •
  <a href="https://sexyvoice.featurebase.app">🗺️ Roadmap</a> •
  <a href="#-getting-started">🚀 Quick Start</a> •
  <a href="#-features">✨ Features</a> •
  <a href="#%EF%B8%8F-tech-stack">🛠️ Tech Stack</a> •
  <a href="./docs/devops.md">⚙️ DevOps Guide</a>
</p>

---

## 🌟 About

- Generate AI voices in 20+ languages with voice cloning support
- Voice selection system with customizable options
<!-- - Public library of generated voices ranked by usage and votes -->
- Credit-based usage system
- User authentication and profile management (Google)
- [Architecture Overview](./ARCHITECTURE.md)

SexyVoice.ai is a cutting-edge AI voice generation platform that empowers users to create high-quality, realistic voices and clone their own voice using advanced machine learning technology. Whether you're a content creator, developer, or business professional, this platform provides the tools you need to generate professional-grade audio content with both pre-made voices and custom voice cloning capabilities.

## ✨ Features

### 🎯 Core Functionality

- **AI Voice Generation**: Create realistic voices powered by state-of-the-art AI models
- **Voice Cloning**: Clone your own voice with as little as 10 seconds of audio
- **Voice Selection System**: Choose from a variety of customizable voice options
- **Multi-language Support**: Generate voices and clone in 20+ languages including English, Spanish, German, French, Italian, Danish, Japanese, Korean, and more
- **Audio Transcription**: Transcribe audio files to text offline in 99+ languages with optional translation to English using Whisper AI
<!-- - **Public Voice Library**: Browse and discover popular voices ranked by community usage and votes -->

### 🔐 User Experience

- **Secure Authentication**: Multiple login options with Google (more coming soon)
- **Credit-based System**: Fair usage tracking with transparent pricing
- **Profile Management**: Personalized dashboard and settings
- **Audio History**: Track and manage all your generated content

### 🌍 Platform Features

- **Responsive Design**: Optimized for desktop and mobile devices
- **International Support**: Full i18n implementation powered by `next-intl` for global accessibility (EN/ES/DE/DA/IT/FR)
- **Localized Site Banners**: Shared banner system for promos and announcements across landing, blog, and dashboard with independent dismiss state and one visible banner at a time
- **Rate Limiting**: Fair usage policies to ensure platform stability
- **Real-time Updates**: Live audio generation with progress tracking
- **Public Tools**: Free utility tools including audio transcription and format conversion

## 🛠️ Tech Stack

### Frontend

- **[Next.js 16](https://nextjs.org)** - React framework with App Router and TypeScript
- **[next-intl](https://next-intl.dev)** - Internationalization for Next.js App Router; messages in `messages/*.json`; `getMessages()` for server components, `useTranslations()` for client components
- **[React 19](https://react.dev)** - Server Components (RSCs), Suspense, and Server Actions
- **[Tailwind 3 CSS](https://tailwindcss.com)** - Utility-first CSS framework
- **[shadcn/ui](https://ui.shadcn.com)** - Modern component library
- **[Radix UI](https://radix-ui.com)** - Headless component primitives

### Backend & Database

- **[Supabase](https://supabase.com)** - Authentication and PostgreSQL database with SSR support
- **[Drizzle ORM](https://orm.drizzle.team)** - Type-safe database operations *(planned)*
- **[Cloudflare R2](https://www.cloudflare.com/developer-platform/r2/)** - Scalable audio file storage with global CDN

### DevOps & Monitoring

- **[Vercel](https://vercel.com)** - Deployment and hosting platform
- **[Sentry](https://sentry.io)** - Error tracking and performance monitoring
- **[PostHog](https://posthog.com)** - Product analytics and feature flags
- **[Axiom](https://axiom.co)** - Structured request logging for API routes
- **[Stripe](https://stripe.com)** - Payment processing and subscription management

### Development Tools

- **[Biome](https://biomejs.dev)** - Fast linter and formatter
- **[TypeScript](https://typescriptlang.org)** - Type safety and developer experience
- **[Contentlayer](https://contentlayer.dev)** - Type-safe content management
- **[Husky](https://typicode.github.io/husky)** - Git hooks for automated tasks
- **[lint-staged](https://github.com/okonet/lint-staged)** - Runs commands on staged files

## 🚀 Getting Started

### Prerequisites

- **Node.js 24+**
- **pnpm**
- **Supabase account** - <https://supabase.com>

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/gianpaj/sexyvoice.git
   cd sexyvoice
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Set up environment variables**

   ```bash
   cp .env.example .env.local
   ```

   Fill in the required environment variables as defined in [`.env.example`](.env.example):
   - Supabase
      - `NEXT_PUBLIC_SUPABASE_URL`
      - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
      - `SUPABASE_SERVICE_ROLE_KEY` - For admin access to Supabase (used in Telegram bot cronjob)
   - Your Redis (Upstash)
      - `KV_REST_API_URL`
      - `KV_REST_API_TOKEN`
   - Cloudflare R2 storage
      - `R2_ACCESS_KEY_ID`
      - `R2_SECRET_ACCESS_KEY`
      - `R2_BUCKET_NAME`
      - `R2_SPEECH_API_BUCKET_NAME` - Dedicated bucket for `/api/v1/speech` generated audio
      - `R2_ENDPOINT` - Your Cloudflare R2 endpoint URL (`https://xxx.r2.cloudflarestorage.com`)
   - AI 3rd party services
      - `REPLICATE_API_TOKEN` - Your Replicate API token for AI voice generation
      - `FAL_KEY` - Your fal.ai API key for voice cloning
      - `GOOGLE_GENERATIVE_AI_API_KEY` - Your Google Generative AI API key for text-to-speech and enhance text (automatically add emotion tags)
      - `XAI_API_KEY` - Your xAI API key for Grok TTS voice generation
   - Real-time Calls (LiveKit)
      - `LIVEKIT_URL`
      - `LIVEKIT_API_KEY`
      - `LIVEKIT_API_SECRET`
   - Stripe
      - `STRIPE_SECRET_KEY`
      - `STRIPE_WEBHOOK_SECRET`
      - `STRIPE_PRICING_ID` - Stripe pricing ID for Pricing table
      - `STRIPE_PUBLISHABLE_KEY` - for Stripe Pricing table
      - `STRIPE_TOPUP_5_PRICE_ID`
      - `STRIPE_TOPUP_10_PRICE_ID`
      - `STRIPE_TOPUP_99_PRICE_ID`
   - Banner and promotion configuration
      - `NEXT_PUBLIC_PROMO_ENABLED` - Enables promo banners and bonus-credit pricing
      - `NEXT_PUBLIC_ACTIVE_PROMO_BANNER` - Active promo banner id from `messages.promos.*` and `lib/banners/registry.ts`
      - `NEXT_PUBLIC_ACTIVE_ANNOUNCEMENT_BANNER` - Active announcement banner id from `messages.announcements.*` and `lib/banners/registry.ts`
      - `NEXT_PUBLIC_PROMO_TRANSLATIONS` - Legacy fallback for active promo banner selection
      - `NEXT_PUBLIC_PROMO_THEME` - Banner theme (`pink`, `orange`, `blue`)
      - `NEXT_PUBLIC_PROMO_COUNTDOWN_END_DATE` - Optional countdown end date for promo banners that support it
      - `NEXT_PUBLIC_PROMO_ID` - Promo identifier still used by Stripe metadata and credit bonus flows
      - `NEXT_PUBLIC_PROMO_BONUS_STARTER`
      - `NEXT_PUBLIC_PROMO_BONUS_STANDARD`
      - `NEXT_PUBLIC_PROMO_BONUS_PRO`
   - Telegram cronjob
      - `TELEGRAM_WEBHOOK_URL` - for daily stats notifications
      - `CRON_SECRET` - For securing the API route - See [Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs)
   - Axiom logging (optional)
      - `AXIOM_TOKEN` - Your Axiom API token for structured request logging on `/api/v1/speech`
   - API key security
      - `API_KEY_HMAC_SECRET` - Secret used to HMAC-SHA256 hash API keys before storing them in the database. Generate with `openssl rand -hex 32`. Without this, keys fall back to plain SHA-256 (acceptable in development, **never** in production).
   - Vercel Edge Config (optional)
      - `EDGE_CONFIG` - Your Vercel Edge Config connection string (automatically set when you link an Edge Config to your project)
   - Additional optional variables for analytics and monitoring (Crisp, Posthog)

   For the full environment variable reference, deployment setup, infrastructure notes, and operational guidance, see [DevOps Guide](./docs/devops.md).

4. **Set up Supabase**
   - Create a new project at Supabase
   - Run database migrations:

   ```bash
   supabase db push
   ```

5. **Start the development server**

   ```bash
   pnpm dev
   ```

6. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000) to see the application.

### Banner System

The app uses a shared banner system for both promotions and announcements:

- `components/banner.tsx` renders the banner UI
- `lib/banners/registry.ts` defines supported banners
- `lib/banners/resolve-banner.ts` resolves the single visible banner per placement
- `app/[lang]/actions/banners.ts` handles dismissal cookies

Banner copy is localized in `messages.promos.*` and `messages.announcements.*`.
Only one banner is shown at a time, and each banner has its own dismiss cookie.

## 🧪 Development

### Available Scripts

| Command                   | Description                             |
| ------------------------- | --------------------------------------- |
| `pnpm dev`                | Start development server with Turbopack |
| `pnpm build`              | Build production application            |
| `pnpm start`              | Start production server                 |
| `pnpm test`               | Run test suite                          |
| `pnpm test:watch`         | Run tests in watch mode                 |
| `pnpm lint`               | Lint codebase with Biome                |
| `pnpm lint:fix`           | Fix linting issues automatically        |
| `pnpm type-check`         | Run TypeScript type checking            |
| `pnpm format`             | Format code with Biome                  |
| `pnpm check-translations` | Validate all locale files have matching keys |
| `pnpm build:content`      | Build content layer                     |
| `pnpm clean`              | Clean unused dependencies with Knip     |
| `pnpm fixall`             | Run all fixes: lint, format, and check  |

### Testing

Run the test suite:

```bash
pnpm test
```

For continuous testing during development:

```bash
pnpm test:watch
```

### Database Operations

Generate TypeScript types from Supabase Cloud Database:

```bash
pnpm run generate-supabase-types
```

Push schema changes to Supabase:

```bash
supabase db push
```

Fetch database migrations:

```bash
supabase migration fetch
```

Backup database and schema:

```bash
export SUPABASE_DB_URL=postgresql://postgres:xxx@db.yyyy.supabase.co:5432/postgres
sh ./scripts/db_backups.sh
```

### Video Generation

Generate waveform videos for audio files using [seewav](https://github.com/adefossez/seewav):

```bash
pip3 install seewav
seewav your_audio.mp3 --color '0.8,0.0,0.4'
```

### wav to mp3

```bash
# Convert WAV to MP3 with specific audio settings
# -i input.wav: Input file
# -acodec libmp3lame: Use LAME MP3 encoder
# -q:a 2: Variable bit rate quality (0=highest, 9=lowest)
# -ar 24000: Set audio sample rate to 24kHz
# -ac 1: Set audio channels to mono (1 channel)
# output.mp3: Output file
ffmpeg -i input.wav -acodec libmp3lame -q:a 2 -ar 24000 -ac 1 output.mp3

# For high quality MP3
ffmpeg -i input.wav -acodec libmp3lame -q:a 0 -ar 44100 -ac 2 output-high-quality.mp3

# For lowest quality MP3 possible
ffmpeg -i input.wav -acodec libmp3lame -q:a 9 -ar 8000 -ac 1 output-lowest.mp3
```

## 🔒 Security

SexyVoice.ai implements multiple security layers:

- **Authentication**: Secure OAuth integration with Supabase Auth
- **Data Protection**: Row-level security (RLS) policies in PostgreSQL
- **API Security**: Rate limiting and request validation
- **File Security**: Secure R2 storage with access controls
- **Error Handling**: Comprehensive error tracking with Sentry
- **Environment Isolation**: Separate configurations for development and production

## 🤝 Contributing

<!-- We welcome contributions! Please see the [contribution guidelines](CONTRIBUTING.md) for details on how to: -->
We welcome contributions!

- Report bugs
- Suggest features
- Submit pull requests
- Review the [DevOps Guide](./docs/devops.md) for environment variables, deployment, infrastructure, and operational setup changes
<!-- - Follow the code of conduct -->

### Setup

Zed with [Cspell](https://github.com/mantou132/zed-cspell/) extension

```bash
npm install -g cspell @cspell/dict-de-de @cspell/dict-es-es
asdf reshim nodejs
cspell link add @cspell/dict-de-de
cspell link add @cspell/dict-es-es
# restart Zed language server
```

## 📄 License

This project is licensed under the [MIT License](LICENSE).

## 🔗 Links

- **Website**: [sexyvoice.ai](https://sexyvoice.ai)
- **Roadmap**: [Feature requests and roadmap](https://sexyvoice.featurebase.app)
- **Documentation**: [API Documentation](https://docs.sexyvoice.ai) NEW
- **Support**: [Contact support](mailto:hello@sexyvoice.ai) or via Chat on the Dashboard

## 🏗️ Project Status

SexyVoice.ai is actively developed and maintained. Check the [roadmap](https://sexyvoice.featurebase.app) for upcoming features and improvements.

### Current Version

- ✅ Core voice generation functionality
- ✅ Voice cloning with custom audio samples
- ✅ User authentication and profiles
- ✅ Credit system and payment processing
- ✅ Website multi-language support (EN/ES/DE/DA/IT/FR) via `next-intl`
- ✅ Audio transcription and translation tool
- ✅ Real-time AI voice calls with configurable AI agents
- ✅ API access

### Supported Languages by these Google Gemini TTS Models

- Puck
- Zephyr
- Gacrux
- Kore
- Sulafat

| Language               | BCP-47 Code              | Language             | BCP-47 Code |
| ---------------------- | ------------------------ | -------------------- | ----------- |
| Arabic (Egyptian)      | `ar-EG`                  | German (Germany)     | `de-DE`     |
| English (US)           | `en-US`                  | Spanish (US)         | `es-US`     |
| French (France)        | `fr-FR`                  | Hindi (India)        | `hi-IN`     |
| Indonesian (Indonesia) | `id-ID`                  | Italian (Italy)      | `it-IT`     |
| Japanese (Japan)       | `ja-JP`                  | Korean (Korea)       | `ko-KR`     |
| Portuguese (Brazil)    | `pt-BR`                  | Russian (Russia)     | `ru-RU`     |
| Dutch (Netherlands)    | `nl-NL`                  | Polish (Poland)      | `pl-PL`     |
| Thai (Thailand)        | `th-TH`                  | Turkish (Turkey)     | `tr-TR`     |
| Vietnamese (Vietnam)   | `vi-VN`                  | Romanian (Romania)   | `ro-RO`     |
| Ukrainian (Ukraine)    | `uk-UA`                  | Bengali (Bangladesh) | `bn-BD`     |
| English (India)        | `en-IN` & `hi-IN` bundle | Marathi (India)      | `mr-IN`     |
| Tamil (India)          | `ta-IN`                  | Telugu (India)       | `te-IN`     |

---

<p align="center">
  Made with ❤️ by Gianfranco
</p>
