import { getExternalApiIssuer } from '../../../lib/api/oauth-discovery';

export const dynamic = 'force-static';

export function GET() {
  const issuer = getExternalApiIssuer();
  const catalog = {
    linkset: [
      {
        anchor: `${issuer}/api/v1`,
        'service-desc': [
          {
            href: `${issuer}/api/v1/openapi`,
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
            href: `${issuer}/api/health`,
          },
        ],
      },
    ],
  };

  return new Response(JSON.stringify(catalog), {
    status: 200,
    headers: {
      'Content-Type': 'application/linkset+json',
      'Cache-Control': 'public, max-age=0, s-maxage=86400',
      'CDN-Cache-Control': 'public, s-maxage=86400',
      'Vercel-CDN-Cache-Control': 'public, s-maxage=86400',
    },
  });
}
