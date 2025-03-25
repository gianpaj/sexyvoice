import { NextResponse, after } from 'next/server';
import { put, list } from '@vercel/blob';
import Replicate, { Prediction } from 'replicate';

import { createClient } from '@/lib/supabase/server';
import {
  getCredits,
  getVoiceIdByName,
  reduceCredits,
  saveAudioFile,
} from '@/lib/supabase/queries';
import { estimateCredits } from '@/lib/utils';
import { APIError } from '@/lib/error-ts';

// const VOICE_API_URL = `${process.env.VOICE_API_URL}/generate-speech`;

async function generateHash(
  text: string,
  voice: string,
  // accent: string,
  // speed: string,
) {
  const textEncoder = new TextEncoder();
  const combinedString = `${text}-${voice}`;
  const data = textEncoder.encode(combinedString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 8);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const text = searchParams.get('text');
    const voice = searchParams.get('voice');

    // if (request.body === null) {
    //   return new Response('Request body is empty', { status: 400 });
    // }

    if (!text || !voice) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 },
      );
    }

    if (text.length > 500) {
      return NextResponse.json(
        new APIError(
          'Text exceeds the maximum length of 500 characters',
          new Response('Text exceeds the maximum length of 500 characters', {
            status: 400,
          }),
        ),
        { status: 400 },
      );
    }

    const supabase = await createClient();

    const { data } = await supabase.auth.getUser();
    const user = data?.user;

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    const voiceId = await getVoiceIdByName(voice);

    if (!voiceId) {
      return NextResponse.json(
        new APIError(
          'Voice not found',
          new Response('Voice not found', {
            status: 400,
          }),
        ),
        { status: 404 },
      );
    }

    const currentAmount = await getCredits(user.id);

    const estimate = estimateCredits(text);

    // console.log({ estimate });

    if (currentAmount < estimate) {
      return NextResponse.json(
        { error: 'Insufficient credits' },
        { status: 402 },
      );
    }

    // Generate hash for the combination of text, voice, and accent
    const hash = await generateHash(text, voice);

    const path = `audio/${voice}-${hash}`;

    // Check if audio file already exists
    const { blobs } = await list({ prefix: path });

    if (blobs.length > 0) {
      // Return existing audio file URL
      return NextResponse.json({ url: blobs[0].url }, { status: 200 });
    }

    // If no existing file found, generate new audio
    // const response = await fetch(`${VOICE_API_URL}`, {
    //   method: "POST",
    //   headers: {
    //     "Content-Type": "application/json",
    //   },
    //   body: JSON.stringify({ text, voice }),
    // });

    const replicate = new Replicate();

    const input = {
      text,
      voice,
      // top_p: 0.95,
      // temperature: 0.6,
      // max_new_tokens: 1200, // max is 2000
      // repetition_penalty: 1.1
    };
    let predictionResult: Prediction | undefined;
    const onProgress = (prediction: Prediction) => {
      predictionResult = prediction;
    };
    const output = (await replicate.run(
      'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f',
      { input },
      onProgress,
    )) as ReadableStream;

    // console.log({ output });

    if ('error' in output) {
      // const errorData = await response.json();
      console.error({
        text,
        voice,
        errorData: output.error,
      });
      // @ts-ignore
      throw new Error(output.error || 'Voice generation failed');
    }

    const filename = `${path}.wav`;

    // await replicate.predictions.cancel(prediction.id);

    // Use hash in the file path for future lookups
    const blobResult = await put(filename, output, {
      access: 'public',
      contentType: 'audio/mpeg',
    });

    after(async () => {
      // const creditsToReduce = await calculateCreditsToReduce(output);

      await reduceCredits({ userId: user.id, currentAmount, amount: estimate });

      const audioFileDBResult = await saveAudioFile({
        userId: user.id,
        filename,
        text,
        url: blobResult.url,
        model: 'lucataco/orpheus-3b-0.1-ft',
        predictionId: predictionResult?.id,
        isPublic: false,
        voiceId,
        duration: '-1',
        // credits_used: estimate,
      });

      if (audioFileDBResult.error) {
        console.error(
          'Failed to insert audio file row:',
          audioFileDBResult.error,
        );
      }
    });

    return NextResponse.json(
      {
        url: blobResult.url,
        creditsUsed: estimate,
        creditsRemaining: (currentAmount || 0) - estimate,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('Voice generation error:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(
      { error: 'Failed to generate voice' },
      { status: 500 },
    );
  }
}

// async function calculateCreditsToReduce(output: ReadableStream<any>): Promise<number> {

// }
