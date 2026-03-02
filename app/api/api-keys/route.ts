import { NextResponse } from 'next/server';
import { z } from 'zod';

import { generateApiKey } from '@/lib/api/auth';
import { createClient } from '@/lib/supabase/server';

const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  expires_at: z.string().datetime().optional().nullable(),
});

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('api_keys')
    .select(
      'id, name, key_prefix, created_at, last_used_at, expires_at, is_active, permissions, metadata',
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: 'Failed to load API keys' },
      { status: 500 },
    );
  }

  return NextResponse.json({ data: data ?? [] }, { status: 200 });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = CreateApiKeySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 },
    );
  }

  const { count, error: countError } = await supabase
    .from('api_keys')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_active', true);

  if (countError) {
    return NextResponse.json(
      { error: 'Failed to count API keys' },
      { status: 500 },
    );
  }

  if ((count ?? 0) >= 10) {
    return NextResponse.json(
      { error: 'Maximum of 10 active API keys allowed' },
      { status: 400 },
    );
  }

  const generated = generateApiKey();
  const expiresAt = parsed.data.expires_at
    ? new Date(parsed.data.expires_at).toISOString()
    : null;

  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      user_id: user.id,
      key_hash: generated.hash,
      key_prefix: generated.prefix,
      name: parsed.data.name.trim(),
      expires_at: expiresAt,
      permissions: { scopes: ['voice:generate'] },
      metadata: {},
      is_active: true,
    })
    .select(
      'id, name, key_prefix, created_at, last_used_at, expires_at, is_active, permissions, metadata',
    )
    .single();

  if (error) {
    return NextResponse.json(
      { error: 'Failed to create API key' },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      data,
      key: generated.key,
    },
    { status: 201 },
  );
}
