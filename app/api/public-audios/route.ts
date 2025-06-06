import { NextResponse } from 'next/server';
import hotRanking from '@/lib/hot-ranking';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const filter = searchParams.get('filter') || 'day';
  const supabase = await createClient();

  let query = supabase
    .from('audio_files')
    .select(
      'id, url, text_content, created_at, voice_id, voices(id, name), audio_votes(vote)'
    )
    .eq('is_public', true);

  const now = new Date();

  if (filter === 'day') {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    query = query.gte('created_at', d.toISOString());
  } else if (filter === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    query = query.gte('created_at', d.toISOString());
  } else if (filter === 'month') {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
    query = query.gte('created_at', d.toISOString());
  }

  const { data, error } = await query;
  if (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to fetch audio files' }, { status: 500 });
  }

  const audioFiles = (data as any[]).map((item) => {
    const votes = item.audio_votes as { vote: number }[] | null;
    const ups = votes?.filter((v) => v.vote === 1).length || 0;
    const downs = votes?.filter((v) => v.vote === -1).length || 0;
    const score = ups - downs;
    const trending = hotRanking(ups, downs, new Date(item.created_at));
    return { ...item, ups, downs, score, trending };
  });

  let sorted = audioFiles;
  if (filter === 'trending') {
    sorted = audioFiles.sort((a, b) => b.trending - a.trending);
  } else {
    sorted = audioFiles.sort((a, b) => b.score - a.score);
  }

  return NextResponse.json(sorted.slice(0, 50));
}
