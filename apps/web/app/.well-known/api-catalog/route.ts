export function GET() {
  const catalog = {
    linkset: [
      {
        anchor: 'https://sexyvoice.ai/api/v1',
        'service-desc': [
          {
            href: 'https://sexyvoice.ai/api/v1/openapi',
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
            href: 'https://sexyvoice.ai/api/health',
          },
        ],
      },
    ],
  };

  return new Response(JSON.stringify(catalog), {
    status: 200,
    headers: {
      'Content-Type': 'application/linkset+json',
    },
  });
}
