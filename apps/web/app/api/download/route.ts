import { type NextRequest, NextResponse } from 'next/server';

// Hosts we are willing to proxy downloads from. The audio files live on
// Cloudflare R2 (served from files.sexyvoice.ai) which does not return CORS
// headers, so a client-side `fetch()` of those URLs is blocked by the browser.
// Proxying the request through this same-origin route avoids the CORS issue
// while keeping us from becoming an open proxy for arbitrary URLs (SSRF).
const ALLOWED_HOSTS = new Set([
  'files.sexyvoice.ai',
  'uxjubqdyhv4aowsi.public.blob.vercel-storage.com',
]);

const getFilename = (pathname: string) => {
  const last = pathname.split('/').pop() || '';
  try {
    return decodeURIComponent(last) || 'generated_audio.mp3';
  } catch {
    return last || 'generated_audio.mp3';
  }
};

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get('url');

  if (!rawUrl) {
    return NextResponse.json(
      { error: 'Missing "url" query parameter' },
      { status: 400 },
    );
  }

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  if (target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.hostname)) {
    return NextResponse.json({ error: 'URL not allowed' }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.toString());
  } catch (error) {
    console.error('Failed to fetch file for download', error);
    return NextResponse.json(
      { error: 'Failed to fetch file' },
      { status: 502 },
    );
  }

  if (!(upstream.ok && upstream.body)) {
    return NextResponse.json(
      { error: 'File not found' },
      { status: upstream.status === 404 ? 404 : 502 },
    );
  }

  const filename = getFilename(target.pathname);
  const contentType =
    upstream.headers.get('content-type') || 'application/octet-stream';

  const headers = new Headers({
    'Content-Type': contentType,
    // Use the RFC 5987 encoded form so any characters in the filename are
    // safely percent-encoded and cannot break the header value.
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'Cache-Control': 'private, max-age=0, no-store',
  });

  const contentLength = upstream.headers.get('content-length');
  if (contentLength) {
    headers.set('Content-Length', contentLength);
  }

  return new NextResponse(upstream.body, { status: 200, headers });
}
