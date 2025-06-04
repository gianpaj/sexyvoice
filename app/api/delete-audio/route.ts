import * as Sentry from '@sentry/nextjs';
import { del } from '@vercel/blob';
import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const audioId = searchParams.get('id');

    if (!audioId) {
      return NextResponse.json(
        { error: 'Audio file ID is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data } = await supabase.auth.getUser();
    const user = data?.user;

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    // First, get the audio file to ensure it exists and belongs to the user
    const { data: audioFile, error: fetchError } = await supabase
      .from('audio_files')
      .select('url, storage_key')
      .eq('id', audioId)
      .eq('user_id', user.id)
      .single();

    if (fetchError) {
      Sentry.captureException({
        error: 'Failed to fetch audio file',
        audioId,
        userId: user.id,
        errorData: fetchError,
      });
      return NextResponse.json(
        { error: 'Audio file not found' },
        { status: 404 }
      );
    }

    if (!audioFile) {
      return NextResponse.json(
        { error: 'Audio file not found or unauthorized' },
        { status: 404 }
      );
    }

    // Delete from database first
    const { error: deleteError } = await supabase
      .from('audio_files')
      .delete()
      .eq('id', audioId)
      .eq('user_id', user.id);

    if (deleteError) {
      Sentry.captureException({
        error: 'Failed to delete audio file from database',
        audioId,
        userId: user.id,
        errorData: deleteError,
      });
      return NextResponse.json(
        { error: 'Failed to delete audio file' },
        { status: 500 }
      );
    }

    // Delete from Vercel Blob Storage
    try {
      await del(audioFile.url);
    } catch (blobError) {
      // Log the error but don't fail the request since the DB deletion succeeded
      Sentry.captureException({
        error: 'Failed to delete audio file from blob storage',
        audioId,
        userId: user.id,
        url: audioFile.url,
        errorData: blobError,
      });
      console.error('Failed to delete from blob storage:', blobError);
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    Sentry.captureException({
      error: 'Audio file deletion error',
      errorData: error,
    });
    console.error('Audio file deletion error:', error);
    
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json(
      { error: 'Failed to delete audio file' },
      { status: 500 }
    );
  }
}