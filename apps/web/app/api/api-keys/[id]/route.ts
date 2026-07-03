import { NextResponse } from 'next/server';

import { APIErrorResponse } from '@/lib/error-ts';
import { createClient } from '@/lib/supabase/server';

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const [{ id }, supabase] = await Promise.all([
    context.params,
    createClient(),
  ]);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return APIErrorResponse('Unauthorized', 401);
  }

  const { data, error } = await supabase
    .from('api_keys')
    .update({ is_active: false })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id');

  if (error) {
    return APIErrorResponse('Failed to deactivate API key', 500);
  }

  if (!data || data.length === 0) {
    return APIErrorResponse('API key not found', 404);
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
