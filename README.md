# SexyVoice.ai - AI Voice Generation Platform

<p align="center">
  <a href="https://sexyvoice.ai">
    <img alt="SexyVoice.ai - AI Voice Generation Platform" src="./public/sexyvoice.ai-og-image.jpg" width="640">
  </a>
</p>

<p align="center">
  <strong>Create stunning AI-generated voices with advanced machine learning technology</strong>
</p>

<p align="center">
  <a href="https://sexyvoice.ai">🌐 Live Demo</a> •
  <a href="https://sexyvoice.featurebase.app">🗺️ Roadmap</a> •
  <a href="#getting-started">🚀 Quick Start</a> •
  <a href="#features">✨ Features</a> •
  <a href="#tech-stack">🛠️ Tech Stack</a>
</p>

---

## 🌟 About

SexyVoice.ai is a cutting-edge AI voice generation platform that empowers users to create high-quality, realistic voices using advanced machine learning technology. Whether you're a content creator, developer, or business professional, our platform provides the tools you need to generate professional-grade audio content.

## ✨ Features

### 🎯 Core Functionality
- **AI Voice Generation**: Create realistic voices powered by state-of-the-art AI models
- **Voice Selection System**: Choose from a variety of customizable voice options
- **Multi-language Support**: Generate voices in English and Spanish (more languages coming soon)
- **Public Voice Library**: Browse and discover popular voices ranked by community usage and votes

### 🔐 User Experience
- **Secure Authentication**: Multiple login options with Google, Facebook, and Apple (coming soon)
- **Credit-based System**: Fair usage tracking with transparent pricing
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

## 🚀 Getting Started

### Prerequisites

- **Node.js 18+** - [Download here](https://nodejs.org/)
- **pnpm** - Install with `npm install -g pnpm`
- **Supabase account** - [Sign up here](https://supabase.com)

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
   - `REPLICATE_API_TOKEN` - Your Replicate API token for AI voice generation
   - `STRIPE_SECRET_KEY` - Stripe secret key for payment processing
   - `BLOB_READ_WRITE_TOKEN` - Vercel Blob storage token
   - Additional optional variables for analytics and monitoring

4. **Set up Supabase**
   - Create a new project at [supabase.com](https://supabase.com)
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

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server with Turbopack |
| `pnpm build` | Build production application |
| `pnpm start` | Start production server |
| `pnpm test` | Run test suite |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm lint` | Lint codebase with Biome |
| `pnpm lint:fix` | Fix linting issues automatically |
| `pnpm type-check` | Run TypeScript type checking |
| `pnpm format` | Format code with Biome |
| `pnpm check-translations` | Validate translation files |
| `pnpm build:content` | Build content layer |
| `pnpm clean` | Clean unused dependencies with Knip |

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
supabase gen types typescript --project-id bfaqdyadcpaetelvpbva > database.types.ts
```

Push schema changes to Supabase:
```bash
supabase db push
```

### Video Generation

Generate waveform videos for audio files using [seewav](https://github.com/adefossez/seewav):

```bash
pip3 install seewav
seewav your_audio.mp3 --color '0.8,0.0,0.4'
```

## 🔧 Troubleshooting

### Common Issues

**Build failures:**
- Ensure all environment variables are properly set
- Run `pnpm install` to update dependencies
- Check that Node.js version is 18 or higher

**Database connection issues:**
- Verify Supabase URL and API keys are correct
- Ensure your Supabase project is active
- Check database migrations are up to date with `supabase db push`

**Authentication problems:**
- Verify OAuth provider configurations in Supabase
- Check redirect URLs are properly configured
- Ensure environment variables for auth providers are set

## 🌐 Deployment

The application is optimized for deployment on Vercel:

1. **Connect your repository** to Vercel
2. **Configure environment variables** in the Vercel dashboard
3. **Deploy** - Vercel will automatically build and deploy your application

For other deployment platforms, ensure you:
- Set all required environment variables
- Configure build commands according to your platform
- Set up proper domain and SSL configuration

### Environment Variables for Production

Ensure the following environment variables are configured in your deployment platform:

- **Required**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `REPLICATE_API_TOKEN`, `STRIPE_SECRET_KEY`
- **Storage**: `BLOB_READ_WRITE_TOKEN` for file uploads
- **Analytics**: `NEXT_PUBLIC_POSTHOG_KEY` for product analytics
- **Monitoring**: Sentry configuration for error tracking
- **Support**: `NEXT_PUBLIC_CRISP_WEBSITE_ID` for customer support chat

## 🔒 Security

SexyVoice.ai implements multiple security layers:

- **Authentication**: Secure OAuth integration with Supabase Auth
- **Data Protection**: Row-level security (RLS) policies in PostgreSQL
- **API Security**: Rate limiting and request validation
- **File Security**: Secure blob storage with access controls
- **Error Handling**: Comprehensive error tracking with Sentry
- **Environment Isolation**: Separate configurations for development and production

## 🤝 Contributing

We welcome contributions! Please see our [contribution guidelines](CONTRIBUTING.md) for details on how to:
- Report bugs
- Suggest features
- Submit pull requests
- Follow our code of conduct

## 📄 License

This project is licensed under the [MIT License](LICENSE).

## 🔗 Links

- **Website**: [sexyvoice.ai](https://sexyvoice.ai)
- **Roadmap**: [Feature requests and roadmap](https://sexyvoice.featurebase.app)
- **Documentation**: [API Documentation](https://docs.sexyvoice.ai) *(coming soon)*
- **Support**: [Contact support](mailto:support@sexyvoice.ai)

## 🏗️ Project Status

SexyVoice.ai is actively developed and maintained. Check our [roadmap](https://sexyvoice.featurebase.app) for upcoming features and improvements.

### Current Version: Beta
- ✅ Core voice generation functionality
- ✅ User authentication and profiles
- ✅ Credit system and payment processing
- ✅ Multi-language support (EN/ES)
- 🚧 Mobile app (coming soon)
- 🚧 API access (coming soon)
- 🚧 Advanced voice customization (in development)

---

<p align="center">
  Made with ❤️ by the SexyVoice.ai Team
</p>