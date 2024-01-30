import { put, list } from '@vercel/blob'
import { NextResponse } from 'next/server'

export const runtime = 'edge'
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const filename = searchParams.get('filename')

  const form = await request.formData()

  const fromUrl = form.get('fromUrl') as string
  const toPathname = form.get('toPathname') as string

  if (!filename || !request.body) {
    return NextResponse.json(
      { error: 'Missing filename or body' },
      { status: 400 }
    )
  }

  // const MAX_FILE_SIZE = 1024 * 1024 * 10; // 10MB
  // const contentLength = request.headers.get('content-length');
  // if (contentLength && Number(contentLength) > MAX_FILE_SIZE) {
  //   return NextResponse.json({ error: 'File too large' }, { status: 400 })
  // }

  const blob = await put(filename, request.body, {
    access: 'public'
  })

  return NextResponse.json(blob)
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const prefix = searchParams.get('prefix')
  const { blobs } = await list({
    limit: 100,
    prefix: prefix || ''
  })

  // let hasMore = true;
  // let cursor;

  // while (hasMore) {
  //   const listResult = await list({
  //     cursor,
  //   });
  //   hasMore = listResult.hasMore;
  //   cursor = listResult.cursor;
  // }
  return Response.json(blobs)
}
