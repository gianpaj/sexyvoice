'use client';

import {
  AlertCircle,
  Headphones,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { AudioWaveform } from '@/components/audio-waveform';
import { GrokTaggedText } from '@/components/grok-tagged-text';
import { Button } from '@/components/ui/button';
import {
  type CloneDemoTakeId,
  type DemoLanguageCode,
  demoCloneSpeakers,
  getDemoCloneSelection,
  getDemoCloneSpeaker,
} from '@/data/demo-clone';
import { Link } from '@/lib/i18n/navigation';
import { attemptPlayback } from '@/lib/media-playback';

export interface DemoCloneLabels {
  audioError: string;
  backToClone: string;
  calmSlow: string;
  clonedVoice: string;
  deliveryLabel: string;
  hearOriginal: string;
  loading: string;
  natural: string;
  originalVoice: string;
  pauseAudio: string;
  pickSpeaker: string;
  playAudio: string;
  preparedExamplesCaption: string;
  retry: string;
  sameOriginal: string;
  sarcastic: string;
  seek: string;
  signUpAndClone: string;
  subtitle: string;
  title: string;
  tryVoice: string;
}

interface DemoClonePlayerProps {
  applying?: boolean;
  initialSpeakerId: string;
  initialTakeId?: CloneDemoTakeId;
  labels: DemoCloneLabels;
  languageLabels: Record<DemoLanguageCode, string>;
  onTryVoice?: (speakerId: string, takeId: CloneDemoTakeId) => void;
}

type Playback = 'idle' | 'loading' | 'playing' | 'error';

const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export function DemoClonePlayer({
  initialSpeakerId,
  initialTakeId = 'natural',
  labels,
  languageLabels,
  onTryVoice,
  applying = false,
}: DemoClonePlayerProps) {
  const [speakerId, setSpeakerId] = useState(
    () => getDemoCloneSpeaker(initialSpeakerId).id,
  );
  const [takeId, setTakeId] = useState<CloneDemoTakeId>(
    () => getDemoCloneSelection(speakerId, initialTakeId)?.take.id ?? 'natural',
  );
  const [source, setSource] = useState<'take' | 'reference'>('take');
  const [playback, setPlayback] = useState<Playback>('idle');
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(
    null,
  );
  const [waveformRetry, setWaveformRetry] = useState(0);
  const setAudioRef = useCallback((element: HTMLAudioElement | null) => {
    audioRef.current = element;
    setAudioElement(element);
  }, []);
  const playRequest = useRef(0);
  const speaker = getDemoCloneSpeaker(speakerId);
  const take = speaker.takes.find((take) => take.id === takeId)!;
  const clip = source === 'take' ? take : speaker.reference;

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      playRequest.current += 1;
      audio?.pause();
    };
  }, []);

  const stop = () => {
    playRequest.current += 1;
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
    setPlayback('idle');
    setCurrentTime(0);
  };

  const pause = () => {
    playRequest.current += 1;
    audioRef.current?.pause();
    setPlayback('idle');
  };

  const play = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    const request = ++playRequest.current;
    setPlayback('loading');
    const played = await attemptPlayback(() => audio.play());
    if (request === playRequest.current)
      setPlayback(played ? 'playing' : 'error');
  };

  const switchSpeaker = (id: string) => {
    stop();
    setSpeakerId(id);
    setTakeId(getDemoCloneSelection(id, takeId)?.take.id ?? 'natural');
    setSource('take');
  };

  const switchTake = (id: CloneDemoTakeId) => {
    stop();
    setTakeId(id);
    setSource('take');
  };

  const switchReference = async () => {
    stop();
    const nextSource = source === 'take' ? 'reference' : 'take';
    // Commit the source before play() so React cannot reload it mid-playback.
    // Keeping playback in this click handler preserves the browser's user gesture.
    flushSync(() => setSource(nextSource));
    await play();
  };

  const PlayIcon = {
    idle: Play,
    error: Play,
    playing: Pause,
    loading: LoaderCircle,
  }[playback];
  const playButtonLabel = {
    idle: labels.playAudio,
    error: labels.playAudio,
    playing: labels.pauseAudio,
    loading: labels.loading,
  }[playback];

  return (
    <div className="rounded-2xl border border-input bg-background/95 p-5 text-left shadow-lg sm:p-7">
      <div className="space-y-2">
        <h2 className="font-semibold text-2xl tracking-tight">
          {labels.title}
        </h2>
        <p className="text-muted-foreground text-sm">{labels.subtitle}</p>
      </div>

      <fieldset
        className="mt-6 flex flex-wrap gap-3 border-0 p-0"
        disabled={applying}
      >
        <legend className="mb-3 text-muted-foreground text-xs">
          {labels.pickSpeaker}
        </legend>
        {demoCloneSpeakers.map((option) => (
          <label
            className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-input p-2.5 has-checked:border-primary has-checked:bg-accent/50 has-focus-visible:ring-2 has-focus-visible:ring-ring"
            data-testid={`demo-clone-speaker-${option.id}`}
            key={option.id}
          >
            <input
              checked={option.id === speakerId}
              className="sr-only"
              name="demo-clone-speaker"
              onChange={() => switchSpeaker(option.id)}
              type="radio"
              value={option.id}
            />
            <Image
              alt=""
              className="size-10 rounded-full object-cover outline outline-black/10 dark:outline-white/10"
              height={40}
              src={option.image}
              unoptimized
              width={40}
            />
            <span className="grid gap-0.5">
              <span className="font-medium text-sm">{option.name}</span>
              <span className="text-muted-foreground text-xs">
                {languageLabels[option.languageCode]}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="mt-5 border-0 p-0" disabled={applying}>
        <legend className="mb-3 text-muted-foreground text-xs">
          {labels.deliveryLabel}
        </legend>
        <div className="flex flex-wrap gap-2">
          {speaker.takes.map((option) => (
            <label
              className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-input px-4 py-2.5 text-sm has-checked:border-primary has-checked:bg-accent has-checked:text-foreground has-focus-visible:ring-2 has-focus-visible:ring-ring"
              key={option.id}
            >
              <input
                checked={option.id === takeId}
                className="sr-only"
                name="demo-clone-take"
                onChange={() => switchTake(option.id)}
                type="radio"
                value={option.id}
              />
              {labels[option.id]}
            </label>
          ))}
        </div>
      </fieldset>

      <blockquote
        className="my-6 text-pretty text-xl leading-8 tracking-tight"
        data-testid="demo-clone-script"
        lang={speaker.languageCode}
      >
        <span aria-hidden="true" className="select-none">
          &ldquo;
        </span>
        <span className="select-all" data-testid="demo-clone-prompt-text">
          <GrokTaggedText
            className="mx-0.5 inline-flex rounded bg-primary/20 px-1 py-0.5 align-baseline text-blue-300"
            provider="voxtral"
            text={take.prompt}
          />
        </span>
        <span aria-hidden="true" className="select-none">
          &rdquo;
        </span>
      </blockquote>

      <div
        className="space-y-4 border-input border-y py-5"
        data-speaker-id={speaker.id}
        data-take-id={take.id}
        data-testid="demo-clone-result"
      >
        {/* A single native player prevents overlapping reference and result audio. */}
        {/* biome-ignore lint/a11y/useMediaCaption: The take transcript is displayed above the player; this element also plays a separate reference recording. */}
        <audio
          onEnded={() => setPlayback('idle')}
          onError={() => setPlayback('error')}
          onPause={() =>
            setPlayback((state) => (state === 'error' ? state : 'idle'))
          }
          onPlaying={() => setPlayback('playing')}
          onTimeUpdate={() =>
            setCurrentTime(audioRef.current?.currentTime ?? 0)
          }
          onWaiting={() => {
            if (!audioRef.current?.paused) setPlayback('loading');
          }}
          preload="metadata"
          ref={setAudioRef}
          src={clip.src}
        />
        <div className="flex items-center gap-4">
          <div aria-live="polite" className="min-w-0 flex-1">
            <p className="font-medium text-sm">
              {source === 'reference' ? labels.originalVoice : labels[take.id]}
            </p>
            <p className="mt-0.5 text-muted-foreground text-xs">
              {speaker.name} · {languageLabels[speaker.languageCode]} ·{' '}
              {source === 'reference'
                ? labels.originalVoice
                : labels.clonedVoice}
            </p>
          </div>
          <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
            {formatTime(currentTime)} / {formatTime(clip.durationSeconds)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Button
            aria-label={playButtonLabel}
            className="min-h-10 min-w-10 shrink-0 rounded-full"
            data-testid="demo-clone-play"
            onClick={() =>
              playback === 'playing' || playback === 'loading'
                ? pause()
                : play()
            }
            size="icon"
            type="button"
            variant="secondary"
          >
            <PlayIcon
              className={
                playback === 'loading'
                  ? 'size-4 animate-spin motion-reduce:animate-none'
                  : 'size-4'
              }
            />
          </Button>
          <div className="relative h-12 min-w-0 flex-1 rounded-md has-focus-visible:ring-2 has-focus-visible:ring-ring">
            {audioElement && (
              <AudioWaveform
                duration={clip.durationSeconds}
                interact={false}
                key={`${clip.src}:${waveformRetry}`}
                media={audioElement}
                onError={() => setPlayback('error')}
                url={new URL(clip.src, audioElement.ownerDocument.baseURI).href}
              />
            )}
            <input
              aria-label={labels.seek}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              max={clip.durationSeconds}
              min={0}
              onChange={(event) => {
                if (audioRef.current)
                  audioRef.current.currentTime = Number(event.target.value);
                setCurrentTime(Number(event.target.value));
              }}
              step={0.01}
              type="range"
              value={Math.min(currentTime, clip.durationSeconds)}
            />
          </div>
        </div>
      </div>

      {playback === 'error' && (
        <div
          className="mt-4 flex flex-wrap items-center gap-2 text-destructive text-sm"
          role="alert"
        >
          <AlertCircle className="size-4 shrink-0" />
          <span>{labels.audioError}</span>
          <Button
            onClick={async () => {
              setWaveformRetry((retry) => retry + 1);
              audioRef.current?.load();
              await play();
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            <RotateCcw className="size-3.5" />
            {labels.retry}
          </Button>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <Button
          className="min-h-11 px-0 text-muted-foreground"
          onClick={switchReference}
          type="button"
          variant="link"
        >
          <Headphones className="size-4" />
          {source === 'reference' ? labels.backToClone : labels.hearOriginal}
        </Button>
        {onTryVoice ? (
          <Button
            className="min-h-11"
            data-testid="demo-clone-try"
            disabled={applying}
            onClick={() => {
              stop();
              onTryVoice(speaker.id, take.id);
            }}
            type="button"
          >
            {applying && (
              <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
            )}
            {labels.tryVoice}
          </Button>
        ) : (
          <Button asChild className="min-h-11">
            <Link
              data-testid="demo-clone-try"
              href={{
                pathname: '/dashboard/clone',
                query: { demo: speaker.id, take: take.id },
              }}
            >
              {labels.signUpAndClone}
            </Link>
          </Button>
        )}
      </div>
      <p className="mt-4 text-pretty text-muted-foreground text-xs">
        {labels.preparedExamplesCaption}
      </p>
    </div>
  );
}
