const { withContentlayer } = require('next-contentlayer2');
// const { withBotId } = require('botid/next/config');

// TODO: generate CSP Header and add policy domains to on the the needed routes
/**
 * Content Security Policy Header - Without Nonce
 * https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy
 */
// DELETE https://x.public.blob.vercel-storage.com on March 18th 2026
const cspHeader = `
    default-src 'self' blob: ${process.env.NEXT_PUBLIC_SUPABASE_URL} https://files.sexyvoice.ai https://client.crisp.chat wss://client.relay.crisp.chat https://cdn.jsdelivr.net https://unpkg.com https://unpkg.com/@lottiefiles https://assets1.lottiefiles.com https://api.unisvg.com https://api.iconify.design https://uxjubqdyhv4aowsi.public.blob.vercel-storage.com;
    script-src 'self' 'unsafe-eval' 'unsafe-inline' blob: https://client.crisp.chat https://js.stripe.com https://vercel.live;
    style-src 'self' 'unsafe-inline' https://client.crisp.chat;
    img-src 'self' blob: data: https://image.crisp.chat https://client.crisp.chat;
    font-src 'self' https://client.crisp.chat;
    object-src 'none';
    worker-src 'self' blob:;
    frame-src 'self' https://js.stripe.com;
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
`;

/** @type {import('next').NextConfig} */
let nextConfig = {
  reactCompiler: true,
  experimental: {
    // Enable filesystem caching for `next dev`
    turbopackFileSystemCacheForDev: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
        port: '',
        pathname: '**',
      },
      {
        protocol: 'https',
        hostname: 'images.sexyvoice.ai',
        port: '',
        pathname: '**',
      },
    ],
  },
  // images: { unoptimized: true },

  async rewrites() {
    return [
      {
        source: '/ingest/static/:path*',
        destination: 'https://eu-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/ingest/:path*',
        destination: 'https://eu.i.posthog.com/:path*',
      },
      {
        source: '/ingest/decide',
        destination: 'https://eu.i.posthog.com/decide',
      },
    ];
  },
  skipTrailingSlashRedirect: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: cspHeader.replace(/\n/g, ''),
          },
          {
            // prevents the browser from attempting to guess the type of content if the `Content-Type` header is not explicitly set.
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          // header is not necessary on Vercel
          // {
          //   // browser should only access using HTTPS, for 2 years
          //   key: 'Strict-Transport-Security',
          //   value: 'max-age=63072000; includeSubDomains; preload',
          // },
        ],
      },
    ];
  },
};

nextConfig = withContentlayer(nextConfig);

// nextConfig = withBotId(nextConfig);

// Injected content via Sentry wizard below
if (process.env.NODE_ENV === 'production') {
  const { withSentryConfig } = require('@sentry/nextjs');

  nextConfig = withSentryConfig(nextConfig, {
    org: 'sexyvoiceai',
    project: 'sexyvoice-ai',

    // Only print logs for uploading source maps in CI
    silent: !process.env.CI,

    telemetry: process.env.VERCEL_ENV === 'production',
    sourcemaps: {
      disable: process.env.VERCEL_ENV !== 'production',
    },

    // For all available options, see:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

    // Upload a larger set of source maps for prettier stack traces (increases build time)
    widenClientFileUpload: true,

    // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
    // This can increase your server load as well as your hosting bill.
    // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
    // side errors will fail.
    tunnelRoute: true, // Generates a random route for each build (recommended)

    // Automatically tree-shake Sentry logger statements to reduce bundle size
    disableLogger: true,

    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: false,
  });
}

module.exports = nextConfig;
