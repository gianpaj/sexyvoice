export const dynamic = 'force-static';

export function GET() {
  return Response.json(
    {
      error: 'openid_discovery_not_supported',
      error_description:
        'SexyVoice API currently supports Bearer API keys, not OpenID Connect discovery.',
    },
    {
      status: 501,
      headers: {
        'Cache-Control': 'public, max-age=0, s-maxage=86400',
        'CDN-Cache-Control': 'public, s-maxage=86400',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=86400',
      },
    },
  );
}
