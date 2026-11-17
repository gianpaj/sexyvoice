import { NextResponse } from 'next/server';

import { APIErrorResponse } from '@/lib/error-ts';
import { revokeApiKeys } from '@/lib/supabase/api-keys';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const [{ id }, supabase] = await Promise.all([
    context.params,
    createClient(),
  ]);
  const claims = await getVerifiedClaims(supabase);

  if (!claims?.sub) {
    return APIErrorResponse('Unauthorized', 401);
  }

  const { data, error } = await revokeApiKeys(supabase, claims.sub, id);

  if (error) {
    return APIErrorResponse('Failed to deactivate API key', 500);
  }

  if (!data || data.length === 0) {
    return APIErrorResponse('API key not found', 404);
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
