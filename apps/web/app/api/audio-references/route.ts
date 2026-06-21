import { NextResponse } from 'next/server';

import { getAudioReferencesForUser } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';

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
