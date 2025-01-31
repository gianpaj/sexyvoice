import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = createClient();

    const { data: audioFiles, error } = await supabase
      .from('audio_files')
      .select(`
        id,
        text_content,
        voice_id,
        total_votes,
        voices (
          name
        )
      `)
      .order('total_votes', { ascending: false })
      .limit(10);

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch audio files' },
        { status: 500 },
      );
    }

    return NextResponse.json(audioFiles);
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
