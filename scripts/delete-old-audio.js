import { del } from '@vercel/blob';
import { Redis } from '@upstash/redis';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: ['.env', '.env.local'] });

const days = Number(process.argv[2]) || 30;
const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase configuration');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const redis = Redis.fromEnv();

async function deleteOldFiles() {
  console.log(`Deleting audio files older than ${days} days...`);

  const { data: files, error } = await supabase
    .from('audio_files')
    .select('id, storage_key, created_at')
    .lte('created_at', cutoff.toISOString());

  if (error) {
    console.error('Error fetching audio files:', error);
    return;
  }

  for (const file of files) {
    try {
      await del(file.storage_key);
      await redis.del(file.storage_key);
      await supabase.from('audio_files').delete().eq('id', file.id);
      console.log(`Deleted ${file.storage_key}`);
    } catch (err) {
      console.error(`Failed to delete ${file.storage_key}:`, err);
    }
  }

  console.log('Deletion complete.');
}

deleteOldFiles().catch((err) => {
  console.error('Error running deletion script:', err);
  process.exit(1);
});
