import * as Sentry from '@sentry/nextjs';
import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import Replicate from 'replicate';

import { APIErrorResponse } from '@/lib/error-ts';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 60; // seconds

const ALLOWED_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/m4a',
  'audio/x-m4a',
];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const MIN_DURATION = 10; // seconds
const MAX_DURATION = 5 * 60; // 5 minutes

async function getAudioDuration(
  fileBuffer: Buffer,
  mimeType: string,
): Promise<number | null> {
  // Use music-metadata-browser for browser, but here we use music-metadata for Node
  try {
    const mm = await import('music-metadata');
    const metadata = await mm.parseBuffer(fileBuffer, mimeType);
    return metadata.format.duration ?? null;
  } catch (e) {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    const user = data?.user;

    if (!user) {
      return APIErrorResponse('User not found', 401);
    }

    // Parse multipart/form-data
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.startsWith('multipart/form-data')) {
      return APIErrorResponse('Content-Type must be multipart/form-data', 400);
    }

    // Use form parsing
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const name = formData.get('name') as string | null;
    const language = formData.get('language') as string | null;

    if (!file || !name || !language) {
      return APIErrorResponse('Missing required fields', 400);
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return APIErrorResponse(
        'Invalid file type. Only MP3, M4A, or WAV allowed.',
        400,
      );
    }

    if (file.size > MAX_SIZE) {
      return APIErrorResponse('File too large. Max 10MB allowed.', 400);
    }

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Check duration
    const duration = await getAudioDuration(buffer, file.type);
    if (duration === null) {
      return NextResponse.json(
        { error: 'Could not determine audio duration.' },
        { status: 400 },
      );
    }
    if (duration < MIN_DURATION || duration > MAX_DURATION) {
      return NextResponse.json(
        {
          error: 'Audio must be between 10 seconds and 5 minutes.',
        },
        { status: 400 },
      );
    }

    // Upload to Vercel Blob
    const filename = `voice-clone/${user.id}-${Date.now()}-${file.name}`;
    const blobResult = await put(filename, buffer, {
      access: 'public',
      contentType: file.type,
      allowOverwrite: false,
    });

    // Call Replicate API
    const replicate = new Replicate();
    const MODEL = 'speech-02-turbo';
    const input = {
      model: MODEL,
      accuracy: 0.7,
      voice_file: blobResult.url,
      // Enable noise reduction. Use this if the voice file has background noise.

      need_noise_reduction: false,
      need_volume_normalization: false,
    };

    // $3.00 per output
    const output = await replicate.run('minimax/voice-cloning', { input });

    const { error } = await supabase.from('voices').insert([
      {
        name,
        language,
        is_public: false,
        is_nsfw: false,
        type: 'cloned',
        model: `minimax/voice-cloning_${MODEL}`,
        user_id: user.id,
      },
    ]);

    return NextResponse.json(
      {
        message: 'Voice cloned successfully',
        voiceUrl: blobResult.url,
        replicateOutput: output,
      },
      { status: 200 },
    );
  } catch (error) {
    Sentry.captureException(error);
    console.error('Clone voice error:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return APIErrorResponse('Failed to clone voice', 500);
  }
}
