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
  <a href="#%EF%B8%8F-tech-stack">🛠️ Tech Stack</a>
</p>

---

## 🌟 About

- Generate AI voices in multiple languages (English & Spanish)
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
- **Multi-language Support**: Generate voices in English, Spanish, and Italian (more languages coming soon)
<!-- - **Public Voice Library**: Browse and discover popular voices ranked by community usage and votes -->

### 🔐 User Experience

- **Secure Authentication**: Multiple login options with Google (more coming soon)
- **Credit-based System**: Fair usage tracking with transparent pricing
- **Promotion System**: Generic promotional system with configurable bonus credits
- **Profile Management**: Personalized dashboard and settings
- **Audio History**: Track and manage all your generated content

### 🌍 Platform Features

- **Responsive Design**: Optimized for desktop and mobile devices
- **International Support**: Full i18n implementation for global accessibility
- **Rate Limiting**: Fair usage policies to ensure platform stability
- **Real-time Updates**: Live audio generation with progress tracking

## 🛠️ Tech Stack

### Frontend

- **[Next.js 15](https://nextjs.org)** - React framework with App Router and TypeScript
- **[React 19](https://react.dev)** - Server Components (RSCs), Suspense, and Server Actions
- **[Tailwind CSS](https://tailwindcss.com)** - Utility-first CSS framework
- **[shadcn/ui](https://ui.shadcn.com)** - Modern component library
- **[Radix UI](https://radix-ui.com)** - Headless component primitives

### Backend & Database

- **[Supabase](https://supabase.com)** - Authentication and PostgreSQL database with SSR support
- **[Drizzle ORM](https://orm.drizzle.team)** - Type-safe database operations *(planned)*
- **[Vercel Blob Storage](https://vercel.com/storage/blob)** - Scalable audio file storage

### DevOps & Monitoring

- **[Vercel](https://vercel.com)** - Deployment and hosting platform
- **[Sentry](https://sentry.io)** - Error tracking and performance monitoring
- **[PostHog](https://posthog.com)** - Product analytics and feature flags
- **[Stripe](https://stripe.com)** - Payment processing and subscription management

### Development Tools

- **[Biome](https://biomejs.dev)** - Fast linter and formatter
- **[TypeScript](https://typescriptlang.org)** - Type safety and developer experience
- **[Contentlayer](https://contentlayer.dev)** - Type-safe content management
- **[Husky](https://typicode.github.io/husky)** - Git hooks for automated tasks
- **[lint-staged](https://github.com/okonet/lint-staged)** - Runs commands on staged files

## 🚀 Getting Started

### Prerequisites

- **Node.js 22+**
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
   - `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anonymous key
   - `SUPABASE_SERVICE_ROLE_KEY` - For admin access to Supabase (used in Telegram cronjob)
   - `KV_REST_API_URL` - Your Redis (Upstash) KV REST API URL
   - `KV_REST_API_TOKEN` - Your Redis (Upstash) KV REST API token
   - `BLOB_READ_WRITE_TOKEN` - Vercel Blob storage token
   - `REPLICATE_API_TOKEN` - Your Replicate API token for AI voice generation
   - `FAL_KEY` - Your fal.ai API key for voice cloning
   - `GOOGLE_GENERATIVE_AI_API_KEY` - Your Google Generative AI API key for text-to-speech and enhance text (automatically add emotion tags)
   - `STRIPE_SECRET_KEY` - Stripe secret key for payment processing
   - `STRIPE_WEBHOOK_SECRET` - Stripe webhook secret for payment processing
   - `STRIPE_PRICING_ID` - Stripe pricing ID for Pricing table
   - `STRIPE_PUBLISHABLE_KEY` - for Stripe Pricing table
   - `STRIPE_TOPUP_5_PRICE_ID`
   - `STRIPE_TOPUP_10_PRICE_ID`
   - `STRIPE_TOPUP_99_PRICE_ID`
   - `TELEGRAM_WEBHOOK_URL` - Telegram cronjob for daily stats notifications
   - `CRON_SECRET` - For the Telegram cronjob - See [Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs)
   
   **Generic Promotion System**:
   - `NEXT_PUBLIC_PROMO_ENABLED` - Enable/disable promotions (`true`/`false`)
   - `NEXT_PUBLIC_PROMO_ID` - Unique identifier for current promotion (e.g., `halloween_2025`)
   - `PROMO_BONUS_STANDARD` - Bonus credits for $5 tier (server-side)
   - `PROMO_BONUS_BASE` - Bonus credits for $10 tier (server-side)
   - `PROMO_BONUS_PREMIUM` - Bonus credits for $99 tier (server-side)
   - `NEXT_PUBLIC_PROMO_BONUS_STANDARD` - Bonus credits for $5 tier (client-side UI)
   - `NEXT_PUBLIC_PROMO_BONUS_BASE` - Bonus credits for $10 tier (client-side UI)
   - `NEXT_PUBLIC_PROMO_BONUS_PREMIUM` - Bonus credits for $99 tier (client-side UI)
   
   - Additional optional variables for analytics and monitoring (Crisp, Posthog)

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
| `pnpm check-translations` | Validate translation files              |
| `pnpm build:content`      | Build content layer                     |
| `pnpm clean`              | Clean unused dependencies with Knip     |

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

Generate TypeScript types from Supabase:

```bash
supabase gen types typescript --project-id PROJECT_ID > database.types.ts
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
```

## 🔒 Security

SexyVoice.ai implements multiple security layers:

- **Authentication**: Secure OAuth integration with Supabase Auth
- **Data Protection**: Row-level security (RLS) policies in PostgreSQL
- **API Security**: Rate limiting and request validation
- **File Security**: Secure blob storage with access controls
- **Error Handling**: Comprehensive error tracking with Sentry
- **Environment Isolation**: Separate configurations for development and production

## 🤝 Contributing

<!-- We welcome contributions! Please see the [contribution guidelines](CONTRIBUTING.md) for details on how to: -->
We welcome contributions!

- Report bugs
- Suggest features
- Submit pull requests
<!-- - Follow the code of conduct -->

## 📄 License

This project is licensed under the [MIT License](LICENSE).

## 🔗 Links

- **Website**: [sexyvoice.ai](https://sexyvoice.ai)
- **Roadmap**: [Feature requests and roadmap](https://sexyvoice.featurebase.app)
- **Documentation**: [API Documentation](https://docs.sexyvoice.ai) *(coming soon)*
- **Support**: [Contact support](mailto:hello@sexyvoice.ai) or via Chat on the Dashboard

## 🏗️ Project Status

SexyVoice.ai is actively developed and maintained. Check the [roadmap](https://sexyvoice.featurebase.app) for upcoming features and improvements.

### Current Version

- ✅ Core voice generation functionality
- ✅ Voice cloning with custom audio samples
- ✅ User authentication and profiles
- ✅ Credit system and payment processing
- ✅ Website multi-language support (EN/ES)
- 🚧 API access (coming soon)

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
