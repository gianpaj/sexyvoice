import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();

    // WE should use redis (@vercel/kv) for this. no need for auth
    const { data, error } = await supabase
      .from('audio_files')
      .select(
        `id,
        url,
        text_content,
        created_at,
        voice_id,
        voices(id, name),
        audio_votes(vote)`
      )
      .eq('is_public', true);

    if (error) {
      console.error(error);
      return NextResponse.json({ error: 'Failed to fetch audio files' }, { status: 500 });
    }

    const audioFiles = (data as any[]).map((item) => {
      const votes = item.audio_votes as { vote: number }[] | null;
      const ups = votes?.filter((v) => v.vote === 1).length || 0;
      const downs = votes?.filter((v) => v.vote === -1).length || 0;
      const score = ups - downs;
      return { ...item, ups, downs, score };
    });

    const sorted = audioFiles.sort((a, b) => b.score - a.score).slice(0, 10);

    return NextResponse.json(sorted);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
