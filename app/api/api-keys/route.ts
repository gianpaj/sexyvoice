import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { createApiKey, getUserApiKeys } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';

const { logger } = Sentry;

// Generate a secure API key
function generateApiKey(): string {
  const prefix = 'sk-';
  const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 48; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return prefix + result;
}

// Hash API key for storage
async function hashApiKey(key: string): Promise<string> {
  const textEncoder = new TextEncoder();
  const data = textEncoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// GET: Get user's API keys
export async function GET() {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    const user = data?.user;

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apiKeys = await getUserApiKeys(user.id);

    return NextResponse.json(apiKeys);
  } catch (error) {
    logger.error('Failed to get API keys', { error });
    return NextResponse.json(
      { error: 'Failed to get API keys' },
      { status: 500 }
    );
  }
}

// POST: Create new API key
export async function POST(request: Request) {
  try {
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

    // Check if user has too many API keys (limit to 10)
    const existingKeys = await getUserApiKeys(user.id);
    if (existingKeys.length >= 10) {
      return NextResponse.json(
        { error: 'Maximum of 10 API keys allowed' },
        { status: 400 }
      );
    }

    // Generate new API key
    const newKey = generateApiKey();
    const keyHash = await hashApiKey(newKey);
    const keyPreview = newKey.slice(-4);

    // Save to database
    await createApiKey({
      userId: user.id,
      name: name.trim(),
      keyHash,
      keyPreview,
    });

    logger.info('API key created', {
      userId: user.id,
      keyName: name.trim(),
    });

    return NextResponse.json({
      key: newKey,
      message: 'API key created successfully',
    });
  } catch (error) {
    logger.error('Failed to create API key', { error });
    return NextResponse.json(
      { error: 'Failed to create API key' },
      { status: 500 }
    );
  }
}