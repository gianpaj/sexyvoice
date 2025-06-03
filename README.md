<p align="center">
  <a href="https://sexyvoice.ai">
  <img alt="SexyVoice.ai - AI Voice Generation Platform" src="./public/sexyvoice.ai-og-image.jpg" width="640">
  <h1 align="center">SexyVoice.ai</h1>
  </a>
</p>

<p align="center">
  <strong>🎙️ Advanced AI Voice Generation Platform</strong><br>
  Create realistic voices with cutting-edge AI technology
</p>

<p align="center">
  <a href="https://sexyvoice.ai">🌐 Visit Website</a> •
  <a href="https://sexyvoice.featurebase.app">🗺️ Roadmap</a> •
  <a href="#getting-started">🚀 Get Started</a> •
  <a href="#features">✨ Features</a>
</p>

---

## 📖 Table of Contents

- [🌟 Overview](#-overview)
- [✨ Features](#-features)
- [🛠️ Tech Stack](#️-tech-stack)
- [🚀 Getting Started](#-getting-started)
- [⚙️ Development](#️-development)
- [🧪 Testing](#-testing)
- [🚢 Deployment](#-deployment)
- [📁 Project Structure](#-project-structure)
- [🌍 Internationalization](#-internationalization)
- [🔐 Security](#-security)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)

## 🌟 Overview

SexyVoice.ai is a next-generation AI voice generation platform that enables users to create realistic, high-quality synthetic voices. Built with modern web technologies and powered by advanced machine learning models, the platform offers a seamless experience for voice synthesis across multiple languages.

### 🎯 Key Highlights

- **AI-Powered Voice Generation**: Create natural-sounding voices using state-of-the-art AI
- **Multi-Language Support**: Generate voices in English and Spanish (more languages coming)
- **Credit-Based System**: Fair usage model with transparent pricing
- **Community-Driven**: Public library of voices rated by the community
- **Modern Architecture**: Built with Next.js 15, React 19, and TypeScript

## ✨ Features

### 🎤 Core Voice Features
- **Voice Selection System**: Choose from a variety of pre-trained voice models
- **Custom Voice Generation**: Create unique voices with personalized characteristics
- **Multi-Language Support**: Generate speech in English and Spanish
- **Audio Quality Options**: Multiple quality settings for different use cases

### 👥 User Experience
- **Public Voice Library**: Discover and use community-generated voices
- **Rating System**: Community-driven voice rankings and feedback
- **Credit Management**: Transparent usage tracking and credit system
- **User Profiles**: Personalized dashboards and voice history

### 🔧 Platform Features
- **Real-time Generation**: Fast voice synthesis with minimal latency
- **Audio Storage**: Secure cloud storage for generated audio files
- **Export Options**: Download voices in multiple audio formats
- **Usage Analytics**: Detailed insights into voice generation patterns

### 🔐 Authentication & Security
- **Secure Authentication**: Email-based login with Supabase Auth
- **Rate Limiting**: Prevent abuse with intelligent usage limits
- **Data Privacy**: GDPR-compliant data handling and storage
- **Social Login**: Google, Facebook, and Apple login (coming soon)

## 🛠️ Tech Stack

### Frontend
- **[Next.js 15](https://nextjs.org)** - React framework with App Router
- **[React 19](https://react.dev)** - Server Components, Suspense, and Server Actions
- **[TypeScript](https://typescriptlang.org)** - Type-safe development
- **[Tailwind CSS](https://tailwindcss.com)** - Utility-first CSS framework
- **[shadcn/ui](https://ui.shadcn.com)** - Beautiful, accessible components
- **[Radix UI](https://radix-ui.com)** - Unstyled, accessible UI primitives

### Backend & Database
- **[Supabase](https://supabase.com)** - Backend-as-a-Service with PostgreSQL
- **[Drizzle ORM](https://orm.drizzle.team)** - Type-safe SQL ORM (planned)
- **[Vercel Blob Storage](https://vercel.com/storage/blob)** - Audio file storage
- **[Upstash Redis](https://upstash.com)** - Caching and rate limiting

### AI & Voice Processing
- **Replicate API** - AI model hosting and inference
- **Advanced Voice Models** - Custom-trained voice synthesis models
- **Audio Processing** - Real-time audio generation and optimization

### DevOps & Monitoring
- **[Vercel](https://vercel.com)** - Deployment and hosting platform
- **[Sentry](https://sentry.io)** - Error tracking and performance monitoring
- **[PostHog](https://posthog.com)** - Product analytics and user insights
- **[Stripe](https://stripe.com)** - Payment processing and subscriptions

### Development Tools
- **[Biome](https://biomejs.dev)** - Fast formatter and linter
- **[Playwright](https://playwright.dev)** - End-to-end testing framework
- **[Contentlayer](https://contentlayer.dev)** - Content management for MDX
- **[pnpm](https://pnpm.io)** - Fast, disk space efficient package manager

## 🚀 Getting Started

### Prerequisites

- **Node.js 18+** - [Download here](https://nodejs.org/)
- **pnpm** - Install with `npm install -g pnpm`
- **Supabase Account** - [Sign up here](https://supabase.com)
- **Vercel Account** - [Sign up here](https://vercel.com) (for deployment)

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
   
   Update `.env.local` with your configuration:
   ```env
   # Supabase Configuration
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   
   # Other required environment variables...
   ```

4. **Set up the database**
   ```bash
   # Push database schema
   supabase db push
   
   # Generate TypeScript types
   pnpm run generate:types
   ```

5. **Start the development server**
   ```bash
   pnpm dev
   ```

6. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## ⚙️ Development

### Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server with Turbopack |
| `pnpm build` | Build production application |
| `pnpm start` | Start production server |
| `pnpm lint` | Run Biome linter |
| `pnpm lint:fix` | Fix linting issues automatically |
| `pnpm format` | Format code with Biome |
| `pnpm type-check` | Run TypeScript type checking |
| `pnpm test` | Run test suite |
| `pnpm test:watch` | Run tests in watch mode |

### Database Operations

```bash
# Push schema changes to Supabase
supabase db push

# Generate TypeScript types from database
supabase gen types typescript --project-id YOUR_PROJECT_ID > lib/supabase/types.d.ts

# Reset database (development only)
supabase db reset
```

## 🧪 Testing

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run end-to-end tests
pnpm test:e2e
```

### Test Coverage

The project includes:
- **Unit Tests**: Testing individual components and utilities
- **Integration Tests**: Testing API routes and database operations
- **E2E Tests**: Full user journey testing with Playwright

## 🚢 Deployment

### Vercel Deployment (Recommended)

1. **Connect to Vercel**
   ```bash
   vercel link
   ```

2. **Set environment variables**
   Configure all required environment variables in Vercel dashboard

3. **Deploy**
   ```bash
   vercel --prod
   ```

### Manual Deployment

```bash
# Build the application
pnpm build

# Start production server
pnpm start
```

## 📁 Project Structure

```
sexyvoice/
├── 📁 app/                    # Next.js App Router pages
│   ├── 📁 [lang]/            # Internationalized routes
│   ├── 📁 api/               # API routes
│   └── 📁 auth/              # Authentication pages
├── 📁 components/            # Reusable React components
│   └── 📁 ui/               # shadcn/ui components
├── 📁 lib/                   # Utility functions and configurations
│   ├── 📁 supabase/         # Database queries and types
│   └── 📁 stripe/           # Payment processing
├── 📁 hooks/                 # Custom React hooks
├── 📁 posts/                 # MDX blog posts
├── 📁 public/                # Static assets
├── 📁 scripts/               # Build and maintenance scripts
└── 📁 supabase/             # Database migrations and config
```

## 🌍 Internationalization

The platform supports multiple languages:

- **English** (`/en`) - Default language
- **Spanish** (`/es`) - Full localization support
- **More languages** - Coming soon based on user demand

### Adding New Languages

1. Create translation files in `lib/i18n/dictionaries/`
2. Update `lib/i18n/i18n-config.ts`
3. Add new routes in `app/[lang]/`

## 🔐 Security

### Authentication
- Email-based authentication via Supabase Auth
- Secure session management with SSR support
- Protected routes with middleware

### Data Protection
- GDPR-compliant data handling
- Encrypted data storage
- Secure API endpoints with rate limiting

### Content Moderation
- Automated content filtering
- Community reporting system
- Manual review process for sensitive content

## 🤝 Contributing

We welcome contributions! Please see our contributing guidelines:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Commit your changes**: `git commit -m 'Add amazing feature'`
4. **Push to the branch**: `git push origin feature/amazing-feature`
5. **Open a Pull Request**

### Development Guidelines

- Follow the existing code style and conventions
- Write tests for new features
- Update documentation as needed
- Ensure all tests pass before submitting

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  <strong>Built with ❤️ by the SexyVoice.ai team</strong><br>
  <a href="https://sexyvoice.ai">Website</a> •
  <a href="https://sexyvoice.featurebase.app">Feature Requests</a> •
  <a href="mailto:support@sexyvoice.ai">Support</a>
</p>
