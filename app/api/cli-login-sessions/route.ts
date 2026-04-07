import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  buildCliCallbackRedirectUrl,
  CLI_LOGIN_SESSION_TTL_MS,
  encryptCliApiKey,
  generateCliExchangeToken,
  hashCliExchangeToken,
  isAllowedCliCallbackUrl,
} from '@/lib/api/cli-login';
import { generateApiKey } from '@/lib/api/auth';
import { hasUserPaid } from '@/lib/supabase/queries';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const CreateCliLoginSessionSchema = z
  .object({
    api_key_id: z.string().uuid().optional(),
    callback_url: z.string().url(),
    name: z.string().trim().min(1).max(100).optional(),
    state: z.string().min(1).max(512),
  })
  .strict()
  .refine((value) => value.api_key_id || value.name, {
    message: 'An API key selection or new key name is required',
    path: ['api_key_id'],
  });

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
  const parsed = CreateCliLoginSessionSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { api_key_id, callback_url, name, state } = parsed.data;
  if (!isAllowedCliCallbackUrl(callback_url)) {
    return NextResponse.json(
      { error: 'Callback URL must target localhost or 127.0.0.1 over HTTP' },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  let selectedKey:
    | Pick<
        Database['public']['Tables']['api_keys']['Row'],
        'expires_at' | 'id' | 'is_active' | 'metadata' | 'name' | 'permissions'
      >
    | null = null;

  if (api_key_id) {
    const { data, error } = await admin
      .from('api_keys')
      .select('id, name, expires_at, is_active, permissions, metadata')
      .eq('id', api_key_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }
    if (!data.is_active) {
      return NextResponse.json(
        { error: 'Selected API key is inactive' },
        { status: 400 },
      );
    }
    if (data.expires_at && new Date(data.expires_at) <= new Date()) {
      return NextResponse.json(
        { error: 'Selected API key is expired' },
        { status: 400 },
      );
    }
    selectedKey = data;
  } else {
    const isPaidUser = await hasUserPaid(user.id);
    if (!isPaidUser) {
      return NextResponse.json(
        { error: 'A subscription or top-up is required to create API keys' },
        { status: 403 },
      );
    }
  }

  const generated = generateApiKey();
  const replacementName = selectedKey?.name ?? name?.trim() ?? 'CLI';

  const { data: newKey, error: newKeyError } = await admin
    .from('api_keys')
    .insert({
      user_id: user.id,
      key_hash: generated.hash,
      key_prefix: generated.prefix,
      name: replacementName,
      permissions: selectedKey?.permissions ?? { scopes: ['voice:generate'] },
      metadata: selectedKey?.metadata ?? {},
      is_active: true,
    })
    .select('id')
    .single();

  if (newKeyError || !newKey) {
    return NextResponse.json(
      { error: 'Failed to create replacement API key' },
      { status: 500 },
    );
  }

  if (selectedKey) {
    const { error: deactivateError } = await admin
      .from('api_keys')
      .update({ is_active: false })
      .eq('id', selectedKey.id)
      .eq('user_id', user.id);

    if (deactivateError) {
      return NextResponse.json(
        { error: 'Failed to rotate selected API key' },
        { status: 500 },
      );
    }
  }

  const exchangeToken = generateCliExchangeToken();
  const expiresAt = new Date(Date.now() + CLI_LOGIN_SESSION_TTL_MS).toISOString();

  const { error: sessionError } = await admin.from('cli_login_sessions').insert({
    user_id: user.id,
    old_api_key_id: selectedKey?.id ?? null,
    new_api_key_id: newKey.id,
    token_hash: hashCliExchangeToken(exchangeToken),
    encrypted_api_key: encryptCliApiKey(generated.key),
    callback_url,
    state,
    expires_at: expiresAt,
  });

  if (sessionError) {
    return NextResponse.json(
      { error: 'Failed to create CLI login session' },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      redirect_url: buildCliCallbackRedirectUrl(
        callback_url,
        exchangeToken,
        state,
      ),
    },
    { status: 201 },
  );
}
