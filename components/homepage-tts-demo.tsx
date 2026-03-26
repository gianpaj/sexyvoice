'use client';

import { Loader2, Play, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';

import {
  AltchaWidget,
  type AltchaWidgetHandle,
} from '@/components/altcha-widget';
import { AudioPlayer } from '@/components/audio-player';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const MAX_CHARS = 200;
const TOTAL_GENERATIONS = 3;
const STORAGE_KEY = 'demo_tts_remaining';
const DEMO_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface DemoVoice {
  id: string;
  name: string;
}

interface HomepageTTSDemoProps {
  challengeUrl: string;
  voices: DemoVoice[];
}

interface StoredRemaining {
  expiresAt: number;
  remaining: number;
}

function getStoredRemaining(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null) return TOTAL_GENERATIONS;

    const parsed = JSON.parse(stored) as StoredRemaining;
    if (
      typeof parsed.remaining !== 'number' ||
      typeof parsed.expiresAt !== 'number'
    ) {
      localStorage.removeItem(STORAGE_KEY);
      return TOTAL_GENERATIONS;
    }

    if (parsed.expiresAt <= Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return TOTAL_GENERATIONS;
    }

    return Math.max(0, parsed.remaining);
  } catch {
    return TOTAL_GENERATIONS;
  }
}

function setStoredRemaining(n: number) {
  try {
    const stored: StoredRemaining = {
      remaining: n,
      expiresAt: Date.now() + DEMO_WINDOW_MS,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // ignore
  }
}

export function HomepageTTSDemo({
  voices,
  challengeUrl,
}: HomepageTTSDemoProps) {
  const t = useTranslations('landing.demo');
  const [text, setText] = useState(() => t('presets.welcome'));
  const [selectedVoiceId, setSelectedVoiceId] = useState(voices[0]?.id ?? '');
  const [remaining, setRemaining] = useState<number>(() =>
    getStoredRemaining(),
  );
  const [status, setStatus] = useState<'idle' | 'loading' | 'playing'>('idle');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [altchaPayload, setAltchaPayload] = useState<string | null>(null);
  const altchaRef = useRef<AltchaWidgetHandle>(null);

  const handleVerified = useCallback((payload: string) => {
    setAltchaPayload(payload);
  }, []);

  const handleExpired = useCallback(() => {
    setAltchaPayload(null);
  }, []);

  const resetAltcha = useCallback(() => {
    setAltchaPayload(null);
    altchaRef.current?.reset();
  }, []);

  const isExhausted = remaining <= 0;
  const presets = [
    t('presets.welcome'),
    t('presets.quickBrownFox'),
    t('presets.typeAnything'),
    t('presets.aiCommunication'),
    t('presets.helloWorld'),
  ];

  async function handleGenerate() {
    setError(null);

    if (!altchaPayload) {
      setError(t('errors.securityPending'));
      return;
    }

    setStatus('loading');

    try {
      const res = await fetch('/api/demo-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voiceId: selectedVoiceId,
          altchaPayload,
        }),
      });

      const data = await res.json();

      if (res.status === 429 || data.error === 'limit_reached') {
        const newRemaining = 0;
        setRemaining(newRemaining);
        setStoredRemaining(newRemaining);
        resetAltcha();
        setStatus('idle');
        return;
      }

      if (!res.ok) {
        resetAltcha();
        setError(
          data.error === 'invalid_captcha'
            ? t('errors.securityFailed')
            : t('errors.generationFailed'),
        );
        setStatus('idle');
        return;
      }

      const newRemaining =
        typeof data.remaining === 'number'
          ? data.remaining
          : Math.max(0, remaining - 1);

      setAudioUrl(data.audioUrl);
      setRemaining(newRemaining);
      setStoredRemaining(newRemaining);
      setStatus('playing');

      // Reset altcha for next generation
      resetAltcha();
    } catch {
      resetAltcha();
      setError(t('errors.unexpected'));
      setStatus('idle');
    }
  }

  return (
    <section className="mx-auto mb-16 w-full max-w-2xl">
      <div className="mb-6 text-center">
        <h2 className="flex items-center justify-center gap-2 font-bold text-2xl text-white">
          <Sparkles className="size-5 text-pink-400" />
          {t('title')}
        </h2>
        <p className="mt-1 text-gray-400 text-sm">
          {t('subtitle')}{' '}
          <span
            className={cn(
              'font-medium',
              isExhausted ? 'text-red-400' : 'text-pink-300',
            )}
          >
            {isExhausted
              ? t('usedAll')
              : t('remainingGenerations', {
                  remaining,
                  total: TOTAL_GENERATIONS,
                })}
          </span>
        </p>
      </div>

      <div
        className={cn(
          'rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm transition-opacity',
          isExhausted && 'pointer-events-none opacity-50',
        )}
      >
        {/* Voice selector */}
        <div className="mb-4">
          <label
            className="mb-1.5 block font-medium text-gray-300 text-sm"
            htmlFor="demo-voice"
          >
            {t('voiceLabel')}
          </label>
          <Select onValueChange={setSelectedVoiceId} value={selectedVoiceId}>
            <SelectTrigger
              className="border-white/20 bg-white/10 text-white"
              id="demo-voice"
            >
              <SelectValue placeholder={t('voicePlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {voices.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name.charAt(0).toUpperCase() + v.name.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Presets */}
        <div className="mb-3">
          <p className="mb-1.5 text-gray-400 text-xs">{t('presetsLabel')}</p>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((preset) => (
              <button
                className={cn(
                  'rounded-full border px-3 py-1 text-xs transition-colors',
                  text === preset
                    ? 'border-pink-500 bg-pink-500/20 text-pink-300'
                    : 'border-white/20 bg-white/5 text-gray-300 hover:border-white/40',
                )}
                key={preset}
                onClick={() => setText(preset)}
                type="button"
              >
                {preset.length > 30 ? `${preset.slice(0, 30)}…` : preset}
              </button>
            ))}
          </div>
        </div>

        {/* Text input */}
        <div className="mb-4">
          <Textarea
            className="resize-none border-white/20 bg-white/10 text-white placeholder:text-gray-500"
            maxLength={MAX_CHARS}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('textPlaceholder')}
            rows={3}
            value={text}
          />
          <p className="mt-1 text-right text-gray-500 text-xs">
            {text.length}/{MAX_CHARS}
          </p>
        </div>

        {/* Altcha */}
        <div className="mb-4">
          <AltchaWidget
            challengeUrl={challengeUrl}
            onExpired={handleExpired}
            onVerified={handleVerified}
            ref={altchaRef}
          />
        </div>

        {/* Error */}
        {error && <p className="mb-3 text-red-400 text-sm">{error}</p>}

        {/* Generate button */}
        <Button
          className="w-full"
          disabled={status === 'loading' || !text.trim() || !selectedVoiceId}
          onClick={handleGenerate}
          size="lg"
        >
          {status === 'loading' ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              {t('generating')}
            </>
          ) : (
            <>
              <Play className="mr-2 size-4" />
              {t('generate')}
            </>
          )}
        </Button>

        {/* Audio player */}
        {audioUrl && status === 'playing' && (
          <div className="mt-4">
            <AudioPlayer url={audioUrl} />
          </div>
        )}
      </div>

      {/* Exhausted CTA */}
      {isExhausted && (
        <div className="mt-4 text-center">
          <p className="mb-3 text-gray-300 text-sm">
            {t.rich('ctaText', {
              count: 10,
              highlight: (chunks) => (
                <span className="font-medium text-pink-300">{chunks}</span>
              ),
            })}
          </p>
          <Button asChild size="lg">
            <a href="/signup">{t('signUpFreeCta')} →</a>
          </Button>
        </div>
      )}
    </section>
  );
}
