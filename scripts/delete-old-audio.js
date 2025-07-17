import { createClient } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';
import { del } from '@vercel/blob';
import { config } from 'dotenv';

config({ path: ['.env', '.env.local'] });

const days = Number.isFinite(Number(process.argv[2]))
  ? Number(process.argv[2])
  : 30;
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

  const BATCH_SIZE = 500;
  let offset = 0;
  let totalDeleted = 0;

  while (true) {
    const { data: files, error } = await supabase
      .from('audio_files')
      .select('id, storage_key, url')
      .lte('created_at', cutoff.toISOString())
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) {
      console.error('Error fetching a batch of audio files:', error);
      return;
    }

    if (files.length === 0) {
      break; // No more files to process
    }

    console.log(`Processing a batch of ${files.length} files...`);

    const urlsToDelete = files.map((f) => f.url).filter(Boolean);
    const redisKeysToDelete = files.map((f) => f.storage_key).filter(Boolean);
    const dbIdsToDelete = files.map((f) => f.id);

    try {
      await Promise.all([
        urlsToDelete.length > 0 ? del(urlsToDelete) : Promise.resolve(),
        redisKeysToDelete.length > 0
          ? redis.del(...redisKeysToDelete)
          : Promise.resolve(),
        supabase.from('audio_files').delete().in('id', dbIdsToDelete),
      ]);

      console.log(`Deleted batch of ${files.length} files.`);
      totalDeleted += files.length;
    } catch (err) {
      console.error(
        'Failed to delete a batch of files. Some files in this batch may not have been deleted. Error:',
        err,
      );
    }

    if (files.length < BATCH_SIZE) {
      break; // This was the last batch
    }

    offset += files.length;
  }

  console.log(`Deletion complete. Total files deleted: ${totalDeleted}.`);
}

deleteOldFiles().catch((err) => {
  console.error('Error running deletion script:', err);
  process.exit(1);
});
