export const dynamic = 'force-static';

export function GET() {
  return Response.json(
    {
      error: 'unsupported',
      message:
        'SexyVoice API currently supports Bearer API keys, not OAuth 2.0 discovery.',
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
