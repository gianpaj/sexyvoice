import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { deleteApiKey, updateApiKeyName } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';

const { logger } = Sentry;

// DELETE: Delete API key
export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const { id } = params;

    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    const user = data?.user;

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await deleteApiKey(id, user.id);

    logger.info('API key deleted', {
      userId: user.id,
      keyId: id,
    });

    return NextResponse.json({ message: 'API key deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete API key', { error });
    return NextResponse.json(
      { error: 'Failed to delete API key' },
      { status: 500 }
    );
  }
}

// PATCH: Update API key name
export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const { id } = params;

    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    const user = data?.user;

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    if (name.length > 50) {
      return NextResponse.json(
        { error: 'Name must be 50 characters or less' },
        { status: 400 }
      );
    }

    await updateApiKeyName({
      keyId: id,
      userId: user.id,
      name: name.trim(),
    });

    logger.info('API key updated', {
      userId: user.id,
      keyId: id,
      newName: name.trim(),
    });

    return NextResponse.json({ message: 'API key updated successfully' });
  } catch (error) {
    logger.error('Failed to update API key', { error });
    return NextResponse.json(
      { error: 'Failed to update API key' },
      { status: 500 }
    );
  }
}