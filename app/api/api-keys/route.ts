import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createHash, randomBytes } from 'crypto';
import { createClient } from '@/lib/supabase/server';

const { logger } = Sentry;

// Generate a secure API key
function generateApiKey() {
  const keyData = randomBytes(32);
  const key = keyData.toString('base64url');
  const prefix = `svai_${randomBytes(6).toString('hex')}`;
  const fullKey = `${prefix}_${key}`;
  
  // Create hash for storage (never store the full key)
  const hash = createHash('sha256').update(fullKey).digest('hex');
  
  return { fullKey, prefix, hash };
}

export async function GET() {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('api_keys')
      .select('id, name, description, prefix, created_at, last_used_at, is_active')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to fetch API keys', { error, userId: user.id });
      return NextResponse.json({ error: 'Failed to fetch API keys' }, { status: 500 });
    }

    return NextResponse.json({ apiKeys: data || [] });
  } catch (error) {
    logger.error('API keys fetch error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, description } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    if (name.trim().length > 100) {
      return NextResponse.json({ error: 'Name too long' }, { status: 400 });
    }

    if (description && (typeof description !== 'string' || description.length > 500)) {
      return NextResponse.json({ error: 'Description too long' }, { status: 400 });
    }

    // Check if user has too many API keys (limit to 10)
    const { count } = await supabase
      .from('api_keys')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (count && count >= 10) {
      return NextResponse.json(
        { error: 'Maximum of 10 API keys allowed' }, 
        { status: 400 }
      );
    }

    const { fullKey, prefix, hash } = generateApiKey();

    const { data, error } = await supabase
      .from('api_keys')
      .insert({
        user_id: user.id,
        name: name.trim(),
        description: description?.trim() || null,
        key_hash: hash,
        prefix,
      })
      .select('id, name, description, prefix, created_at, is_active')
      .single();

    if (error) {
      logger.error('Failed to create API key', { error, userId: user.id });
      return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 });
    }

    // Return the full key only once during creation
    return NextResponse.json({ 
      apiKey: data, 
      key: fullKey // This is the only time the full key is returned
    });
  } catch (error) {
    logger.error('API key creation error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}