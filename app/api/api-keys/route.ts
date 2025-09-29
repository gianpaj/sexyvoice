import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getApiKeysByUserId, createApiKey, deleteApiKey } from '@/lib/supabase/queries';
import crypto from 'node:crypto';
import * as Sentry from '@sentry/nextjs';

const { logger } = Sentry;

// Get user's API keys
export async function GET() {
  try {
    const supabase = await createClient();
    
    const { data } = await supabase.auth.getUser();
    const user = data?.user;

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 401 }
      );
    }

    const apiKeys = await getApiKeysByUserId(user.id);
    return NextResponse.json(apiKeys);
  } catch (error) {
    logger.error('Failed to fetch API keys', { error });
    console.error('Failed to fetch API keys:', error);
    return NextResponse.json(
      { error: 'Failed to fetch API keys' },
      { status: 500 }
    );
  }
}

// Create new API key
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    
    const { data } = await supabase.auth.getUser();
    const user = data?.user;

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { description } = body;

    // Generate a secure API key
    const apiKey = `sk-${crypto.randomBytes(24).toString('hex')}`;
    
    // Hash the API key for storage
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    // Store the hashed key in the database
    await createApiKey({
      userId: user.id,
      keyHash,
      description,
    });

    // Return the unhashed key to the user (they won't see it again)
    return NextResponse.json({ key: apiKey });
  } catch (error) {
    logger.error('Failed to create API key', { error });
    console.error('Failed to create API key:', error);
    return NextResponse.json(
      { error: 'Failed to create API key' },
      { status: 500 }
    );
  }
}

// Delete API key
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    
    const { data } = await supabase.auth.getUser();
    const user = data?.user;

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'API key ID is required' },
        { status: 400 }
      );
    }

    await deleteApiKey(id, user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete API key', { error });
    console.error('Failed to delete API key:', error);
    return NextResponse.json(
      { error: 'Failed to delete API key' },
      { status: 500 }
    );
  }
}