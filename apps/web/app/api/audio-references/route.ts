import { captureException } from '@sentry/nextjs';
import { NextResponse } from 'next/server';

import {
  createInworldVoice,
  deleteInworldVoice,
  INWORLD_MIN_DURATION,
  InworldError,
  isInworldSupportedLocale,
  prepareInworldReferenceAudio,
} from '@/lib/clone/inworld';
import { CLONING_FILE_MAX_SIZE } from '@/lib/supabase/constants';
import {
  getAudioReferencesForUser,
  hasUserPaid,
  insertAudioReference,
} from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';

const MAX_VOICE_NAME_LENGTH = 60;

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const provider =
    new URL(request.url).searchParams.get('provider') ?? undefined;

  const { data, error } = await getAudioReferencesForUser(user.id, provider);

  if (error) {
    console.error(error);
    return NextResponse.json(
      { error: 'Failed to fetch audio references' },
      { status: 500 },
    );
  }

  return NextResponse.json({ data });
}

// Mint a reusable Inworld voice from an uploaded sample (no text/synthesis).
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: linear validate → process → mint → persist flow
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Inworld voices are a paid-only feature.
    if (!(await hasUserPaid(user.id))) {
      return NextResponse.json(
        { error: 'Creating voices requires a paid account' },
        { status: 403 },
      );
    }

    const contentType = request.headers.get('content-type') || '';
    if (!contentType.startsWith('multipart/form-data')) {
      return NextResponse.json(
        { error: 'Content-Type must be multipart/form-data' },
        { status: 400 },
      );
    }

    const formData = await request.formData();
    const fileValue = formData.get('file');
    const nameValue = formData.get('name');
    const localeValue = formData.get('locale');

    const file = fileValue instanceof File ? fileValue : null;
    const name = typeof nameValue === 'string' ? nameValue.trim() : '';
    const locale = typeof localeValue === 'string' ? localeValue : '';

    if (!file) {
      return NextResponse.json(
        { error: 'Missing audio file' },
        { status: 400 },
      );
    }
    if (!name) {
      return NextResponse.json(
        { error: 'A voice name is required' },
        { status: 400 },
      );
    }
    if (name.length > MAX_VOICE_NAME_LENGTH) {
      return NextResponse.json(
        {
          error: `Voice name must be at most ${MAX_VOICE_NAME_LENGTH} characters`,
        },
        { status: 400 },
      );
    }
    if (!isInworldSupportedLocale(locale)) {
      return NextResponse.json(
        { error: `Unsupported language: ${locale}` },
        { status: 400 },
      );
    }
    if (file.size > CLONING_FILE_MAX_SIZE) {
      return NextResponse.json({ error: 'File too large' }, { status: 413 });
    }

    const inputBuffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type.split(';')[0]?.trim().toLowerCase() || '';

    let prepared: Awaited<ReturnType<typeof prepareInworldReferenceAudio>>;
    try {
      prepared = await prepareInworldReferenceAudio({
        buffer: inputBuffer,
        filename: file.name,
        mimeType,
      });
    } catch (error) {
      console.error('Inworld reference audio processing failed:', error);
      return NextResponse.json(
        { error: 'Could not process the audio. Use MP3, OGG, Opus, or WAV.' },
        { status: 400 },
      );
    }

    if (prepared.duration === null) {
      return NextResponse.json(
        { error: 'Could not determine audio duration' },
        { status: 400 },
      );
    }
    if (prepared.duration < INWORLD_MIN_DURATION) {
      return NextResponse.json(
        {
          error: `Reference audio must be at least ${INWORLD_MIN_DURATION} seconds`,
        },
        { status: 400 },
      );
    }

    let voiceId: string;
    try {
      ({ voiceId } = await createInworldVoice({
        displayName: name,
        locale,
        referenceAudioBuffer: prepared.buffer,
      }));
    } catch (error) {
      if (error instanceof InworldError) {
        if (error.status >= 400 && error.status < 500) {
          return NextResponse.json(
            {
              error:
                'The voice provider could not process this audio. Please try a different sample.',
            },
            { status: 400 },
          );
        }
        return NextResponse.json(
          {
            error:
              'Voice provider is temporarily unavailable. Please try again.',
          },
          { status: 503 },
        );
      }
      throw error;
    }

    const inserted = await insertAudioReference({
      userId: user.id,
      provider: 'inworld',
      voiceId,
      name,
      isPaid: true,
    });

    if (inserted.error) {
      captureException(inserted.error, {
        user: { id: user.id },
        extra: { voiceId },
      });
      // Roll back the remote voice so it isn't orphaned/untracked.
      try {
        await deleteInworldVoice(voiceId);
      } catch (rollbackError) {
        captureException(rollbackError, {
          user: { id: user.id },
          extra: { voiceId, reason: 'rollback_after_insert_failure' },
        });
      }
      return NextResponse.json(
        { error: 'Failed to save the voice' },
        { status: 500 },
      );
    }

    return NextResponse.json({ data: inserted.data }, { status: 201 });
  } catch (error) {
    console.error('Failed to create audio reference:', error);
    captureException(error);
    return NextResponse.json(
      { error: 'Failed to create voice' },
      { status: 500 },
    );
  }
}
