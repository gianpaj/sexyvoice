import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-static';

export function GET() {
  const catalog = {
    linkset: [
      {
        anchor: `${SITE_URL}/api/v1`,
        'service-desc': [
          {
            href: `${SITE_URL}/api/v1/openapi`,
            type: 'application/openapi+json',
          },
        ],
        'service-doc': [
          {
            href: 'https://docs.sexyvoice.ai',
            type: 'text/html',
          },
        ],
        status: [
          {
            href: `${SITE_URL}/api/health`,
          },
        ],
      },
    ],
  };

  return new Response(JSON.stringify(catalog), {
    headers: {
      'Cache-Control': 'public, max-age=0, s-maxage=86400',
      'CDN-Cache-Control': 'public, s-maxage=86400',
      'Content-Type': 'application/linkset+json',
      'Vercel-CDN-Cache-Control': 'public, s-maxage=86400',
    },
    status: 200,
  });
}
