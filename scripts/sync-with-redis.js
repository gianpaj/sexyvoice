import { Redis } from '@upstash/redis';
import { list } from '@vercel/blob';
import { config } from 'dotenv';

config({
  path: ['.env', '.env.local'],
});

// Initialize Redis client from environment variables
const redis = Redis.fromEnv();

/**
 * Process all blobs with the prefix 'audio/' and store them in Redis
 */
async function processAllBlobs() {
  let cursor = undefined;
  let hasMore = true;
  let totalProcessed = 0;

  console.log('Starting to process blobs from Vercel Blob...');

  while (hasMore) {
    try {
      // Fetch a batch of up to 100 blobs
      const listOfBlobs = await list({
        cursor,
        limit: 100,
        prefix: 'audio/',
      });

      // Process this batch
      await processBatch(listOfBlobs.blobs);

      totalProcessed += listOfBlobs.blobs.length;
      console.log(`Processed ${totalProcessed} blobs so far`);

      // Update cursor for the next iteration
      cursor = listOfBlobs.cursor;
      hasMore = listOfBlobs.hasMore;

      if (!hasMore) {
        console.log('No more blobs to process');
        break;
      }
    } catch (error) {
      console.error('Error fetching blobs:', error);
      break;
    }
  }

  console.log(`Completed processing. Total blobs processed: ${totalProcessed}`);
}

/**
 * Process a batch of blobs and store them in Redis
 * @param {Array} blobs - Array of blob objects
 */
async function processBatch(blobs) {
  // Create a pipeline to batch Redis operations
  const pipeline = redis.pipeline();

  for (const blob of blobs) {
    try {
      // Extract information from the pathname
      // Format is 'audio/voice_enum-hash.wav'
      const filename = blob.pathname;

      if (!filename.endsWith('.wav')) {
        console.log(`Skipping non-WAV file: ${filename}`);
        continue;
      }

      // Extract the voice_enum and hash from the filename
      // Remove the '.wav' extension and 'audio/' prefix
      const pathWithoutPrefix = filename.replace('audio/', '');
      const pathWithoutExtension = pathWithoutPrefix.replace('.wav', '');

      // Split by the first hyphen to get voice_enum and hash
      const splitIndex = pathWithoutExtension.indexOf('-');
      if (splitIndex === -1) {
        console.log(`Skipping file with invalid format: ${filename}`);
        continue;
      }


      console.log(filename, blob.url);

      // Store in Redis with the key as the hash and value as an object with voice_enum and url
      pipeline.set(filename, blob.url);
    } catch (error) {
      console.error(`Error processing blob ${blob.pathname}:`, error);
    }
  }

  // Execute the Redis pipeline
  await pipeline.exec();
  console.log(`Added ${blobs.length} entries to Redis`);
}

// Main execution
processAllBlobs()
  .then(() => console.log('Process completed successfully'))
  .catch((err) => console.error('Error in main process:', err));
