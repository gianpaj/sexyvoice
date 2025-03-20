import { NextResponse } from 'next/server';
import { put, list } from '@vercel/blob';

const VOICE_API_URL = `${process.env.VOICE_API_URL}/synthesize_speech`;

async function generateHash(
  text: string,
  voice: string,
  accent: string,
  speed: string,
) {
  const textEncoder = new TextEncoder();
  const combinedString = `${text}-${voice}-${accent}-${speed} `;
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
    const accent = searchParams.get('accent');
    const speed = searchParams.get('speed') || '1.0';

    if (!text || !voice || !accent) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 },
      );
    }

    const speedNumber = Number.parseFloat(speed);
    if (speedNumber < 0.5 || speedNumber > 4) {
      return NextResponse.json(
        { error: 'speed must be between 0.5 and 4' },
        { status: 400 },
      );
    }

    if (text.length > 500) {
      return NextResponse.json(
        { error: 'Text exceeds the maximum length of 500 characters' },
        { status: 400 },
      );
    }

    // Generate hash for the combination of text, voice, and accent
    const hash = await generateHash(text, voice, accent, speed);

    // Check if audio file already exists
    const { blobs } = await list({ prefix: `audio/${hash}` });

    if (blobs.length > 0) {
      // Return existing audio file URL
      return NextResponse.json({ url: blobs[0].url }, { status: 200 });
    }

    // If no existing file found, generate new audio
    const response = await fetch(
      `${VOICE_API_URL}?text=${encodeURIComponent(text)}&accent=en-newest&voice=${encodeURIComponent(voice)}&language=${encodeURIComponent(accent)}`,
      {
        method: 'GET',
      },
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error({
        text,
        voice,
        accent,
        errorData,
      });
      throw new Error(errorData.detail || 'Voice generation failed');
    }

    const audioData = await response.arrayBuffer();
    const audioBlob = new Blob([audioData], { type: 'audio/mpeg' });

    // Use hash in the file path for future lookups
    const path = `audio/${hash}-${voice}-${accent}.wav`;
    const uploadResponse = await put(path, audioBlob, {
      access: 'public',
      contentType: 'audio/mpeg',
    });

    return NextResponse.json({ url: uploadResponse.url }, { status: 200 });
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
