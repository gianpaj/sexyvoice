import { NextResponse } from 'next/server';
import { z } from 'zod';

import { generateApiKey } from '@/lib/api/auth';
import { APIErrorResponse } from '@/lib/error-ts';
import { hasUserPaid } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';

const MAX_ACTIVE_API_KEYS = 10;

const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  expires_at: z.iso.datetime().optional().nullable(),
});

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return APIErrorResponse('Unauthorized', 401);
  }

  const { data, error } = await supabase
    .from('api_keys')
    .select(
      'id, name, key_prefix, created_at, last_used_at, expires_at, is_active, permissions, metadata',
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return APIErrorResponse('Failed to load API keys', 500);
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
    return APIErrorResponse('Unauthorized', 401);
  }

  const payload = await request.json().catch(() => null);
  const parsed = CreateApiKeySchema.safeParse(payload);
  if (!parsed.success) {
    return APIErrorResponse('Invalid request body', 400);
  }

  const isPaidUser = await hasUserPaid(user.id);

  if (!isPaidUser) {
    return APIErrorResponse(
      'A subscription or top-up is required to create API keys',
      403,
    );
  }

  const { count, error: countError } = await supabase
    .from('api_keys')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_active', true);

  if (countError) {
    return APIErrorResponse('Failed to count API keys', 500);
  }

  if ((count ?? 0) >= MAX_ACTIVE_API_KEYS) {
    return APIErrorResponse(
      `Maximum of ${MAX_ACTIVE_API_KEYS} active API keys allowed`,
      400,
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
    return APIErrorResponse('Failed to create API key', 500);
  }

  return NextResponse.json(
    {
      data,
      key: generated.key,
    },
    { status: 201 },
  );
}
