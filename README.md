<p align="center">
  <a href="https://sexyvoice.ai">
  <img alt="SexyVoice.ai Chatbot" src="./public/sexyvoice.ai-og-image.jpg" width="640">
  <h1 align="center">SexyVoice.ai</h1>
  </a>
</p>

<p align="center">
  🎯 <strong>AI Voice Generation Platform</strong> | 🌍 Multi-language Voice Synthesis | 🤖 Machine Learning Powered
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#tech-stack">Tech Stack</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#development">Development</a> •
  <a href="#deployment">Deployment</a> •
  <a href="#roadmap">Roadmap</a>
</p>

---

## 📖 Table of Contents

- [🌟 About](#about)
- [✨ Features](#features)
- [🛠️ Tech Stack](#tech-stack)
- [🚀 Getting Started](#getting-started)
- [💻 Development](#development)
- [🧪 Testing](#testing)
- [📁 Project Structure](#project-structure)
- [🌍 Internationalization](#internationalization)
- [🚢 Deployment](#deployment)
- [🗺️ Roadmap](#roadmap)
- [🤝 Contributing](#contributing)
- [📜 License](#license)

## 🌟 About

SexyVoice.ai is a cutting-edge AI voice generation platform that leverages advanced machine learning models to create high-quality synthetic voices. Users can generate custom voice content in multiple languages, explore a public library of generated audio, and manage their usage through a comprehensive credit system.

### Key Highlights
- 🎙️ **Advanced AI Voice Synthesis** - State-of-the-art voice generation technology
- 🌐 **Multi-language Support** - English and Spanish with more languages coming
- 👥 **Public Voice Library** - Community-driven collection of generated voices
- 💳 **Credit-based System** - Transparent usage tracking and management
- 🔐 **Secure Authentication** - Multiple login options including social providers

## ✨ Features

### 🎯 Core Voice Functionality
- **AI Voice Generation**: Create high-quality synthetic voices using advanced ML models
- **Voice Selection System**: Choose from a variety of customizable voice options
- **Multi-language Support**: Generate voices in English and Spanish
- **Audio Preview**: Real-time preview of generated voice content
- **Custom Voice Cloning**: Advanced voice replication capabilities

### 👤 User Experience
- **Public Voice Library**: Browse and discover community-generated voices
- **Usage Rankings**: Voices ranked by popularity and community votes
- **Credit Management**: Transparent credit-based usage system
- **User Profiles**: Comprehensive profile management and settings
- **History Tracking**: Complete history of generated audio files

### 🌐 Platform Features
- **Authentication System**: Secure login with Google, Facebook, and Apple (coming soon)
- **Responsive Design**: Optimized for desktop, tablet, and mobile devices
- **Internationalization**: Full i18n support for English and Spanish
- **Real-time Updates**: Live updates and notifications
- **Audio Storage**: Reliable cloud-based audio file management

### 🔒 Security & Management
- **Rate Limiting**: Intelligent usage controls and abuse prevention
- **Content Moderation**: Automated and manual content review systems
- **Privacy Controls**: Granular privacy settings for generated content
- **Data Protection**: GDPR-compliant data handling and storage

## 🛠️ Tech Stack

### Frontend
- **[Next.js 15](https://nextjs.org)** - React framework with App Router
- **[React 19](https://react.dev)** - Modern React with Server Components
- **[TypeScript](https://typescriptlang.org)** - Type-safe development
- **[Tailwind CSS](https://tailwindcss.com)** - Utility-first CSS framework
- **[shadcn/ui](https://ui.shadcn.com)** - Modern component library
- **[Radix UI](https://radix-ui.com)** - Headless component primitives

### Backend & Database
- **[Supabase](https://supabase.com)** - Backend-as-a-Service with SSR support
- **[Drizzle ORM](https://orm.drizzle.team)** - Type-safe database operations
- **PostgreSQL** - Robust relational database
- **[Vercel Blob Storage](https://vercel.com/storage/blob)** - Audio file storage

### AI & Machine Learning
- **OpenVoice** - Advanced voice synthesis models
- **[Replicate](https://replicate.com)** - ML model hosting and inference
- **Custom ML Pipeline** - Voice processing and generation

### DevOps & Deployment
- **[Vercel](https://vercel.com)** - Production deployment and hosting
- **[Sentry](https://sentry.io)** - Error tracking and monitoring
- **[PostHog](https://posthog.com)** - Product analytics and feature flags
- **[Stripe](https://stripe.com)** - Payment processing and billing

### Development Tools
- **[Biome](https://biomejs.dev)** - Linting and code formatting
- **[Contentlayer](https://contentlayer.dev)** - Content management
- **[Playwright](https://playwright.dev)** - End-to-end testing
- **pnpm** - Fast package management

## 🚀 Getting Started

### Prerequisites
- **Node.js** (v18 or higher)
- **pnpm** (v8 or higher)
- **Supabase** account and project
- **Vercel** account (for blob storage)

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

3. **Environment setup**
```bash
cp .env.example .env.local
```
Fill in the required environment variables (see [Environment Variables](#environment-variables) section).

4. **Database setup**
```bash
# Push migrations to Supabase
supabase db push
```

5. **Start development server**
```bash
pnpm dev
```

Open [localhost:3000](http://localhost:3000) to view the application.

### Environment Variables

Create a `.env.local` file with the following variables:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Vercel Blob Storage
BLOB_READ_WRITE_TOKEN=your_blob_token

# Stripe (for payments)
STRIPE_SECRET_KEY=your_stripe_secret_key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key

# AI Services
REPLICATE_API_TOKEN=your_replicate_token

# Analytics
NEXT_PUBLIC_POSTHOG_KEY=your_posthog_key
NEXT_PUBLIC_POSTHOG_HOST=your_posthog_host

# Monitoring
SENTRY_DSN=your_sentry_dsn
```

## 💻 Development

### Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server with Turbopack |
| `pnpm build` | Build production application |
| `pnpm start` | Start production server |
| `pnpm test` | Run unit tests |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm lint` | Run Biome linter |
| `pnpm lint:fix` | Fix linting issues automatically |
| `pnpm format` | Format code with Biome |
| `pnpm type-check` | Run TypeScript type checking |

### Database Operations

```bash
# Push schema changes to Supabase
supabase db push

# Generate TypeScript types from Supabase
supabase gen types typescript --project-id YOUR_PROJECT_ID > database.types.ts

# Run database migrations
supabase migration up
```

### Content Management

```bash
# Build content with Contentlayer
pnpm build:content

# Start content development server
pnpm dev:content

# Check translation completeness
pnpm check-translations
```

## 🧪 Testing

### Unit Tests
```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch
```

### End-to-End Tests
```bash
# Install Playwright browsers
npx playwright install

# Run E2E tests
npx playwright test

# Run tests with UI
npx playwright test --ui
```

### Code Quality
```bash
# Run linting
pnpm lint

# Fix linting issues
pnpm lint:fix

# Check for unused dependencies
pnpm clean

# Type checking
pnpm type-check
```

## 📁 Project Structure

```
sexyvoice/
├── app/                    # Next.js App Router
│   ├── [lang]/            # Internationalized routes
│   ├── api/               # API routes
│   └── globals.css        # Global styles
├── components/            # Reusable React components
│   └── ui/               # shadcn/ui components
├── hooks/                # Custom React hooks
├── lib/                  # Utility functions and configurations
│   ├── supabase/         # Supabase client and queries
│   ├── i18n/             # Internationalization
│   └── stripe/           # Payment processing
├── public/               # Static assets
├── posts/                # Blog content (MDX)
├── supabase/             # Database migrations and config
└── scripts/              # Build and utility scripts
```

## 🌍 Internationalization

The application supports multiple languages using Next.js' built-in i18n capabilities:

- **English** (default) - `/en`
- **Spanish** - `/es`

### Adding New Languages

1. Create dictionary file in `lib/i18n/dictionaries/`
2. Update `lib/i18n/i18n-config.ts`
3. Add translations using the `getDictionary` function
4. Run translation check: `pnpm check-translations`

## 🚢 Deployment

### Vercel Deployment (Recommended)

1. **Connect your repository** to Vercel
2. **Configure environment variables** in Vercel dashboard
3. **Deploy** - Automatic deployments on push to main branch

### Manual Deployment

```bash
# Build the application
pnpm build

# Start production server
pnpm start
```

### Database Migrations

```bash
# Production database migrations
supabase db push --project-ref YOUR_PROJECT_REF
```

## 🗺️ Roadmap

View our comprehensive [project roadmap](./ROADMAP.md) for planned features and development phases.

### Current Phase: Core Platform Enhancement
- ✅ User authentication and profile management
- ✅ Voice generation and selection system
- ✅ Credit-based usage tracking
- 🔄 Enhanced voice library and discovery
- 🔄 Advanced audio processing features
- 📋 Performance optimization and scaling

### Upcoming Features
- 🎯 Additional language support
- 🎯 Advanced voice customization options
- 🎯 API access for developers
- 🎯 Mobile application
- 🎯 Enterprise features and integrations

## 🤝 Contributing

We welcome contributions from the community! Please see our [Contributing Guidelines](./CONTRIBUTING.md) for details on:

- Code of conduct
- Development setup
- Pull request process
- Issue reporting
- Feature requests

### Quick Start for Contributors

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Run the test suite: `pnpm test`
5. Commit your changes: `git commit -m 'Add amazing feature'`
6. Push to your branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

## 📞 Support

- **Documentation**: [sexyvoice.ai/docs](https://sexyvoice.ai/docs)
- **Community**: [Discord Server](https://discord.gg/sexyvoice)
- **Issues**: [GitHub Issues](https://github.com/gianpaj/sexyvoice/issues)
- **Email**: support@sexyvoice.ai

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

---

<p align="center">
  <strong>Built with ❤️ by the SexyVoice.ai Team</strong>
</p>

<p align="center">
  <a href="https://sexyvoice.ai">Website</a> •
  <a href="https://twitter.com/sexyvoiceai">Twitter</a> •
  <a href="https://github.com/gianpaj/sexyvoice">GitHub</a>
</p>