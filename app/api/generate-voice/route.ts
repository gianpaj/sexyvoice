import { NextResponse, after } from 'next/server';
import { put, list } from '@vercel/blob';
import Replicate, { Prediction } from 'replicate';

import { createClient } from '@/lib/supabase/server';
import { getCredits } from '@/lib/supabase/queries';

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
    // const accent = searchParams.get('accent');
    // const speed = searchParams.get('speed') || '1.0';

    if (!text || !voice) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 },
      );
    }

    if (text.length > 500) {
      return NextResponse.json(
        { error: 'Text exceeds the maximum length of 500 characters' },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    const { data } = await supabase.auth.getUser();
    const user = data?.user;

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    const currentAmount = await getCredits(user.id);

    const estimate = estimateCredits(text);

    console.log({ estimate });

    if (currentAmount < estimate) {
      return NextResponse.json(
        { error: 'Insufficient credits' },
        { status: 402 },
      );
    }

    // Generate hash for the combination of text, voice, and accent
    const hash = await generateHash(text, voice);

    // Check if audio file already exists
    const { blobs } = await list({ prefix: `audio/${voice}-${hash}` });

    // if (blobs.length > 0) {
    //   // Return existing audio file URL
    //   return NextResponse.json({ url: blobs[0].url }, { status: 200 });
    // }

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
      // max_new_tokens: 1200,
      // repetition_penalty: 1.1
    };
    // const onProgress = (prediction: Prediction) => {
    //   console.log({ prediction });
    // };
    const output = (await replicate.run(
      'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f',
      { input },
      // onProgress,
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
    // if (!response.ok) {
    //   const errorData = await response.json();
    //   console.error({
    //     text,
    //     voice,
    //     errorData,
    //   });
    //   throw new Error(errorData.detail || "Voice generation failed");
    // }
    const filename = `audio/${voice}-${hash}.wav`;

    // await replicate.predictions.cancel(prediction.id);

    // Use hash in the file path for future lookups
    const blobResult = await put(filename, output, {
      access: 'public',
      contentType: 'audio/mpeg',
    });

    after(async () => {
      // const creditsToReduce = await calculateCreditsToReduce(output);
      // reduce the number of credits
      await reduceCredits({ userId: user.id, currentAmount, amount: estimate });
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

async function reduceCredits({
  userId,
  currentAmount,
  amount,
}: { userId: string; currentAmount: number; amount: number }) {
  const supabase = await createClient();

  const newAmount = (currentAmount || 0) - amount;

  const { error: updateError } = await supabase
    .from('credits')
    .update({ amount: newAmount })
    .eq('user_id', userId);

  if (updateError) throw updateError;
}

function estimateCredits(text: string): number {
  // Remove extra whitespace and split into words
  const words = text.trim().split(/\s+/).length;

  // Using average speaking rate of 135 words per minute (middle of 120-150 range)
  const wordsPerSecond = 135 / 60; // 2.25 words per second

  // Calculate estimated seconds (credits)
  return Math.ceil(words / wordsPerSecond);
}

// async function calculateCreditsToReduce(output: ReadableStream<any>): Promise<number> {

// }
