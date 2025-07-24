const { withContentlayer } = require('next-contentlayer2');
// const { withBotId } = require('botid/next/config');

/**
 * Content Security Policy Header - Without Nonce
 * https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy
 */
const cspHeader = `
    default-src 'self' https://bfaqdyadcpaetelvpbva.supabase.co https://files.sexyvoice.ai https://client.crisp.chat wss://client.relay.crisp.chat https://cdn.jsdelivr.net https://unpkg.com/@lottiefiles https://assets1.lottiefiles.com https://uxjubqdyhv4aowsi.public.blob.vercel-storage.com https://api.unisvg.com https://api.iconify.design;
    script-src 'self' 'unsafe-eval' 'unsafe-inline' https://client.crisp.chat https://js.stripe.com https://vercel.live;
    style-src 'self' 'unsafe-inline' https://client.crisp.chat;
    img-src 'self' blob: data: https://image.crisp.chat https://client.crisp.chat;
    font-src 'self' https://client.crisp.chat;
    object-src 'none';
    frame-src 'self' https://js.stripe.com;
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
`;

/** @type {import('next').NextConfig} */
let nextConfig = {
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
        hostname: 'uxjubqdyhv4aowsi.public.blob.vercel-storage.com',
        port: '',
      },
    ],
  },
  eslint: {
    ignoreDuringBuilds: true,
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

if (process.env.ANALYZE === 'true') {
  const withBundleAnalyzer = require('@next/bundle-analyzer')({
    enabled: true,
  });
  nextConfig = withBundleAnalyzer(nextConfig);
}

nextConfig = withContentlayer(nextConfig);

// nextConfig = withBotId(nextConfig);

// Injected content via Sentry wizard below
if (process.env.NODE_ENV === 'production') {
  const { withSentryConfig } = require('@sentry/nextjs');

  nextConfig = withSentryConfig(nextConfig, {
    // For all available options, see:
    // https://www.npmjs.com/package/@sentry/webpack-plugin#options

    org: 'sexyvoiceai',
    project: 'sexyvoice-ai',

    // Only print logs for uploading source maps in CI
    silent: !process.env.CI,

    // For all available options, see:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

    // Upload a larger set of source maps for prettier stack traces (increases build time)
    widenClientFileUpload: true,

    // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
    // This can increase your server load as well as your hosting bill.
    // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
    // side errors will fail.
    tunnelRoute: '/monitoring',

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
