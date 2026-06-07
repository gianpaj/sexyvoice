import { type NextRequest, NextResponse } from 'next/server';

import { getFileFromR2, R2_PUBLIC_HOST } from '@/lib/storage/upload';

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

  // Only proxy files we know live in our own R2 bucket (avoids SSRF).
  if (target.protocol !== 'https:' || target.host !== R2_PUBLIC_HOST) {
    return NextResponse.json({ error: 'URL not allowed' }, { status: 400 });
  }

  // The public URL is `${R2_PUBLIC_URL}/${key}`, so the object key is the
  // pathname without its leading slash.
  let key = target.pathname.replace(/^\/+/, '');
  try {
    key = decodeURIComponent(key);
  } catch {
    // keep the raw key if it isn't valid percent-encoding
  }

  if (!key) {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  let object: Awaited<ReturnType<typeof getFileFromR2>>;
  try {
    object = await getFileFromR2(key);
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } })
      .$metadata?.httpStatusCode;
    if (status === 404) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    console.error('Failed to fetch file for download', error);
    return NextResponse.json(
      { error: 'Failed to fetch file' },
      { status: 502 },
    );
  }

  if (!object.Body) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const filename = getFilename(target.pathname);
  const contentType = object.ContentType || 'application/octet-stream';

  const headers = new Headers({
    'Content-Type': contentType,
    // RFC 5987 encoded form keeps any characters in the filename safe.
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'Cache-Control': 'private, max-age=0, no-store',
  });

  if (typeof object.ContentLength === 'number') {
    headers.set('Content-Length', String(object.ContentLength));
  }

  return new NextResponse(object.Body.transformToWebStream(), {
    status: 200,
    headers,
  });
}
