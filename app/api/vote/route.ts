import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const { audioId, vote } = await req.json();
  if (!audioId || ![1, -1].includes(vote)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: existing } = await supabase
    .from('audio_votes')
    .select('id, vote')
    .eq('audio_id', audioId)
    .eq('user_id', user.id)
    .single();

  try {
    if (!existing) {
      await supabase.from('audio_votes').insert({ audio_id: audioId, user_id: user.id, vote });
    } else if (existing.vote === vote) {
      await supabase.from('audio_votes').delete().eq('id', existing.id);
    } else {
      await supabase.from('audio_votes').update({ vote }).eq('id', existing.id);
    }

    const { data: votes } = await supabase
      .from('audio_votes')
      .select('vote')
      .eq('audio_id', audioId);

    const ups = votes?.filter((v) => v.vote === 1).length ?? 0;
    const downs = votes?.filter((v) => v.vote === -1).length ?? 0;

    return NextResponse.json({ ups, downs });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
