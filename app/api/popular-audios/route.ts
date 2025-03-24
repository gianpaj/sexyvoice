import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();

    // WE should use redis (@vercel/kv) for this. no need for auth
    const { data: audioFiles, error } = await supabase
      .from('audio_files')
      .select(
        `id,
        url,
        total_votes,
        is_public,
        text_content,
        voice_id,
        voices (
          id,
          name
        )`,
      )
      .order('total_votes', { ascending: false })
      .limit(10);

    if (error) {
      console.error(error);
      return NextResponse.json(
        { error: 'Failed to fetch audio files' },
        { status: 500 },
      );
    }

    return NextResponse.json(audioFiles);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
