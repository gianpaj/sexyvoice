/**
 * Content Security Policy Header - Without Nonce
 * https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy
 */
const cspHeader = `
    default-src 'self' https://bfaqdyadcpaetelvpbva.supabase.co https://client.crisp.chat wss://client.relay.crisp.chat https://cdn.jsdelivr.net https://unpkg.com/@lottiefiles https://assets1.lottiefiles.com https://uxjubqdyhv4aowsi.public.blob.vercel-storage.com https://api.unisvg.com;
    script-src 'self' 'unsafe-eval' 'unsafe-inline' https://client.crisp.chat https://js.stripe.com https://vercel.live;
    style-src 'self' 'unsafe-inline' https://client.crisp.chat;
    img-src 'self' blob: data: https://image.crisp.chat https://client.crisp.chat;
    font-src 'self';
    object-src 'none';
    frame-src 'self' https://js.stripe.com;
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
`;

/** @type {import('next').NextConfig} */
const nextConfig = {
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

const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: true,
});
module.exports =
  process.env.ANALYZE === 'true' ? withBundleAnalyzer(nextConfig) : nextConfig;
