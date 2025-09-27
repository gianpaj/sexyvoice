import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';

const { logger } = Sentry;

interface Params {
  keyId: string;
}

export async function DELETE(request: Request, props: { params: Promise<Params> }) {
  try {
    const params = await props.params;
    const { keyId } = params;

    if (!keyId) {
      return NextResponse.json({ error: 'Key ID is required' }, { status: 400 });
    }

    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // First check if the API key exists and belongs to the user
    const { data: existingKey, error: fetchError } = await supabase
      .from('api_keys')
      .select('id')
      .eq('id', keyId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !existingKey) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }

    // Delete the API key
    const { error } = await supabase
      .from('api_keys')
      .delete()
      .eq('id', keyId)
      .eq('user_id', user.id);

    if (error) {
      logger.error('Failed to delete API key', { error, keyId, userId: user.id });
      return NextResponse.json({ error: 'Failed to delete API key' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('API key deletion error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}