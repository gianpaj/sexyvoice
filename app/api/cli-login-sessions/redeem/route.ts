import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  decryptCliApiKey,
  hashCliExchangeToken,
} from '@/lib/api/cli-login';
import { createAdminClient } from '@/lib/supabase/admin';

const RedeemCliLoginSessionSchema = z
  .object({
    exchange_token: z.string().min(1),
  })
  .strict();

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = RedeemCliLoginSessionSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: session, error } = await admin
    .from('cli_login_sessions')
    .select('id, encrypted_api_key, expires_at, redeemed_at, new_api_key_id')
    .eq('token_hash', hashCliExchangeToken(parsed.data.exchange_token))
    .maybeSingle();

  if (error || !session) {
    return NextResponse.json(
      { error: 'CLI login session not found' },
      { status: 404 },
    );
  }

  if (session.redeemed_at || !session.encrypted_api_key) {
    return NextResponse.json(
      { error: 'CLI login session has already been redeemed' },
      { status: 410 },
    );
  }

  if (new Date(session.expires_at) <= new Date()) {
    return NextResponse.json(
      { error: 'CLI login session has expired' },
      { status: 410 },
    );
  }

  let apiKey: string;
  try {
    apiKey = decryptCliApiKey(session.encrypted_api_key);
  } catch {
    return NextResponse.json(
      { error: 'CLI login session could not be decrypted' },
      { status: 500 },
    );
  }

  const { error: updateError } = await admin
    .from('cli_login_sessions')
    .update({
      redeemed_at: new Date().toISOString(),
      encrypted_api_key: null,
    })
    .eq('id', session.id);

  if (updateError) {
    return NextResponse.json(
      { error: 'Failed to finalize CLI login session' },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      api_key_id: session.new_api_key_id,
      key: apiKey,
    },
    { status: 200 },
  );
}
