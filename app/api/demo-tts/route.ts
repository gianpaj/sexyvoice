import { createHash } from 'node:crypto';
import {
  FinishReason,
  type GenerateContentConfig,
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
} from '@google/genai';
import * as Sentry from '@sentry/nextjs';
import { Redis } from '@upstash/redis';
import { verifySolution } from 'altcha-lib';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { convertToWav } from '@/lib/audio';
import { uploadFileToR2 } from '@/lib/storage/upload';
import { createAdminClient } from '@/lib/supabase/admin';

const { logger, captureException } = Sentry;

const redis = Redis.fromEnv();

const DEMO_COOKIE_NAME = 'demo_session_id';
const DEMO_LIMIT = 3;
const DEMO_WINDOW_SECONDS = 60 * 60 * 24; // 24 hours
const DEMO_IP_LIMIT = 15;
const MAX_TEXT_LENGTH = 200;
const ALTCHA_REPLAY_WINDOW_SECONDS = 60 * 10; // 10 minutes

function getAltchaHmacKey(): string | undefined {
  return process.env.ALTCHA_HMAC_KEY;
}

function getAltchaPayloadFingerprint(payload: string): string {
  return createHash('sha256').update(payload).digest('hex');
}

async function verifyAltcha(payload: string): Promise<boolean> {
  const hmacKey = getAltchaHmacKey();

  if (!hmacKey) {
    logger.error('ALTCHA_HMAC_KEY is not configured');
    return false;
  }

  try {
    const verified = await verifySolution(payload, hmacKey);

    if (!verified) {
      return false;
    }

    const replayKey = `demo:altcha:${getAltchaPayloadFingerprint(payload)}`;
    const alreadyUsed = await redis.get(replayKey);

    if (alreadyUsed) {
      return false;
    }

    await redis.set(replayKey, '1', { ex: ALTCHA_REPLAY_WINDOW_SECONDS });

    return true;
  } catch (err) {
    captureException(err, { extra: { context: 'altcha-verify' } });
    return false;
  }
}

async function checkAndIncrementRateLimit(
  cookieId: string,
  ip: string,
): Promise<{ allowed: boolean; remaining: number }> {
  const cookieKey = `demo:cookie:${cookieId}`;
  const ipKey = `demo:ip:${ip}`;

  const [cookieCount, ipCount] = await Promise.all([
    redis.get<number>(cookieKey),
    redis.get<number>(ipKey),
  ]);

  const currentCookieCount = cookieCount ?? 0;
  const currentIpCount = ipCount ?? 0;

  if (currentCookieCount >= DEMO_LIMIT || currentIpCount >= DEMO_IP_LIMIT) {
    return { allowed: false, remaining: 0 };
  }

  // Increment both counters atomically
  const pipeline = redis.pipeline();
  pipeline.incr(cookieKey);
  pipeline.expire(cookieKey, DEMO_WINDOW_SECONDS);
  pipeline.incr(ipKey);
  pipeline.expire(ipKey, DEMO_WINDOW_SECONDS);
  await pipeline.exec();

  const remaining = DEMO_LIMIT - (currentCookieCount + 1);
  return { allowed: true, remaining: Math.max(0, remaining) };
}

export async function POST(request: Request) {
  let text = '';
  try {
    const body = await request.json();
    text = (body.text ?? '').trim();
    const voiceId: string = body.voiceId ?? '';
    const altchaPayload: string = body.altchaPayload ?? '';

    // Validate inputs
    if (!(text && voiceId && altchaPayload)) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
    }

    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json({ error: 'text_too_long' }, { status: 400 });
    }

    // Verify Altcha captcha
    const captchaValid = await verifyAltcha(altchaPayload);
    if (!captchaValid) {
      return NextResponse.json({ error: 'invalid_captcha' }, { status: 400 });
    }

    // Resolve cookie session ID
    const cookieStore = await cookies();
    let sessionId = cookieStore.get(DEMO_COOKIE_NAME)?.value;
    const isNewSession = !sessionId;
    if (!sessionId) {
      sessionId = crypto.randomUUID();
    }

    // Get client IP
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      '0.0.0.0';

    // Check rate limits (sessionId is always string at this point)
    const resolvedSessionId = sessionId as string;
    const { allowed, remaining } = await checkAndIncrementRateLimit(
      resolvedSessionId,
      ip,
    );
    if (!allowed) {
      return NextResponse.json(
        { error: 'limit_reached', remaining: 0 },
        { status: 429 },
      );
    }

    // Validate voiceId is a public gpro voice
    const supabase = createAdminClient();
    const { data: voice, error: voiceError } = await supabase
      .from('voices')
      .select('id, name')
      .eq('id', voiceId)
      .eq('model', 'gpro')
      .eq('is_public', true)
      .single();

    if (voiceError || !voice) {
      return NextResponse.json({ error: 'invalid_voice' }, { status: 400 });
    }

    // Call Gemini 2.5 Flash TTS
    const ai = new GoogleGenAI({
      apiKey:
        process.env.GOOGLE_GENERATIVE_AI_API_KEY_SECONDARY ||
        process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    });

    const geminiConfig: GenerateContentConfig = {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: voice.name.charAt(0).toUpperCase() + voice.name.slice(1),
          },
        },
      },
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
      ],
    };

    const genAIResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: [{ parts: [{ text }] }],
      config: geminiConfig,
    });

    const audioData =
      genAIResponse?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    const mimeType =
      genAIResponse?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.mimeType;
    const finishReason = genAIResponse?.candidates?.[0]?.finishReason;

    if (finishReason !== FinishReason.STOP || !audioData || !mimeType) {
      logger.error('Demo TTS generation failed', {
        finishReason,
        hasData: !!audioData,
      });
      return NextResponse.json({ error: 'generation_failed' }, { status: 500 });
    }

    const audioBuffer = convertToWav(audioData, mimeType);
    const filename = `demo-audio/${voice.name}-${Date.now()}.wav`;
    const audioUrl = await uploadFileToR2(filename, audioBuffer, 'audio/wav');

    // Build response with Set-Cookie if new session
    const response = NextResponse.json(
      { audioUrl, remaining },
      { status: 200 },
    );

    if (isNewSession) {
      response.cookies.set(DEMO_COOKIE_NAME, resolvedSessionId, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: '/',
      });
    }

    return response;
  } catch (err) {
    captureException(err, { extra: { text } });
    logger.error('Demo TTS route error', { error: err });
    return NextResponse.json({ error: 'generation_failed' }, { status: 500 });
  }
}
