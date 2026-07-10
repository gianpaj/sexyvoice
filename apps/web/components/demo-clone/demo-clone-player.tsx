'use client';

import { AlertCircle } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

import {
  type AudioPlayerControls,
  AudioPlayerWithContext,
} from '@/components/audio-player-with-context';
import { AudioProvider } from '@/components/audio-provider';
import { Button } from '@/components/ui/button';
import {
  type DemoLanguageCode,
  demoCloneSentences,
  demoCloneSpeakers,
  getDemoCloneClip,
  getDemoCloneClipKey,
} from '@/data/demo-clone';

export interface DemoCloneLabels {
  audioError: string;
  hearResult: string;
  pickLanguage: string;
  pickSentence: string;
  pickSpeaker: string;
  playAudio: string;
  preparedExamplesCaption: string;
  referenceLabel: string;
  resultLabel: string;
  retry: string;
}

export interface DemoCloneLanguageOption {
  code: DemoLanguageCode;
  label: string;
}

interface DemoClonePlayerProps {
  initialLanguageCode: DemoLanguageCode;
  labels: DemoCloneLabels;
  languages: readonly DemoCloneLanguageOption[];
}

export function DemoClonePlayer({
  initialLanguageCode,
  labels,
  languages,
}: DemoClonePlayerProps) {
  const [speakerId, setSpeakerId] = useState(demoCloneSpeakers[0].id);
  const [languageCode, setLanguageCode] =
    useState<DemoLanguageCode>(initialLanguageCode);
  const [sentenceId, setSentenceId] = useState(demoCloneSentences[0].id);
  const [resultRevealed, setResultRevealed] = useState(false);
  const [hasAudioError, setHasAudioError] = useState(false);
  // Bumped to remount the players, forcing wavesurfer to refetch after a retry.
  const [retryNonce, setRetryNonce] = useState(0);

  const referenceControls = useRef<AudioPlayerControls | null>(null);
  const resultControls = useRef<AudioPlayerControls | null>(null);

  const speaker =
    demoCloneSpeakers.find((s) => s.id === speakerId) ?? demoCloneSpeakers[0];

  const clip = getDemoCloneClip(speakerId, languageCode, sentenceId);
  const clipKey = getDemoCloneClipKey(speakerId, languageCode, sentenceId);

  // The grid-totality test guarantees `clip` resolves for every reachable
  // triple. Retaining the last good clip means that if a speaker or language is
  // ever added without its audio, the widget degrades to a stale clip plus an
  // inline error rather than a blank player.
  const [lastGoodClip, setLastGoodClip] = useState(clip);
  useEffect(() => {
    if (clip) {
      setLastGoodClip(clip);
    }
  }, [clip]);
  const activeClip = clip ?? lastGoodClip;

  const stopResult = () => resultControls.current?.stop();
  const stopReference = () => referenceControls.current?.stop();

  // Changing any selection pauses playback; the clip swaps in place. Handled
  // here rather than in an effect because the reference player only remounts on
  // a speaker change, so a language or sentence change would otherwise leave it
  // playing.
  const resetPlayback = () => {
    stopReference();
    stopResult();
    setHasAudioError(false);
  };

  const handleRetry = () => {
    setHasAudioError(false);
    setRetryNonce((nonce) => nonce + 1);
  };

  return (
    <AudioProvider>
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-8">
        {/* Speaker picker */}
        <fieldset className="flex flex-col items-center gap-3 border-none p-0">
          <legend className="mb-2 text-center text-muted-foreground text-sm">
            {labels.pickSpeaker}
          </legend>
          <div className="flex items-center justify-center gap-6">
            {demoCloneSpeakers.map((option) => {
              const isSelected = option.id === speakerId;
              return (
                <label
                  className="group flex cursor-pointer flex-col items-center gap-1.5"
                  key={option.id}
                >
                  <input
                    checked={isSelected}
                    className="peer sr-only"
                    name="demo-clone-speaker"
                    onChange={() => {
                      setSpeakerId(option.id);
                      resetPlayback();
                    }}
                    type="radio"
                    value={option.id}
                  />
                  <div
                    className={`relative rounded-full p-[2px] transition-all duration-300 ${
                      isSelected
                        ? `bg-linear-to-tr ${option.accent}`
                        : 'bg-transparent'
                    } group-hover:scale-105 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background`}
                    style={
                      isSelected
                        ? {
                            boxShadow: `0 0 12px 6px rgba(${option.glowColor}, 0.25)`,
                          }
                        : undefined
                    }
                  >
                    <div className="rounded-full bg-background p-[2px]">
                      <div className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-neutral-800 sm:h-16 sm:w-16">
                        <Image
                          alt={option.name}
                          className={`object-cover transition-opacity duration-300 ${
                            isSelected ? '' : 'opacity-60 grayscale'
                          }`}
                          fill
                          sizes="64px"
                          src={option.image}
                          unoptimized
                        />
                      </div>
                    </div>
                  </div>
                  <span
                    className={`font-medium text-xs transition-colors ${
                      isSelected
                        ? 'text-foreground'
                        : 'text-muted-foreground group-hover:text-foreground'
                    }`}
                  >
                    {option.name}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* Reference clip */}
        <div className="flex w-full flex-col items-center gap-2 rounded-lg border bg-muted/30 p-4">
          <p className="text-muted-foreground text-sm">
            {labels.referenceLabel}
          </p>
          <AudioPlayerWithContext
            key={`reference-${speaker.id}-${retryNonce}`}
            onControlsReady={(controls) => {
              referenceControls.current = controls;
            }}
            onError={() => setHasAudioError(true)}
            onPlaybackStart={stopResult}
            playAudioTitle={labels.playAudio}
            progressColor="#8b5cf6"
            showWaveform
            url={speaker.referenceSrc}
            waveColor="#888888"
          />
        </div>

        {/* Language picker */}
        <fieldset className="w-full border-none p-0">
          <legend className="mb-2 text-center text-muted-foreground text-sm">
            {labels.pickLanguage}
          </legend>
          <div className="flex items-center justify-center gap-2">
            {languages.map((option) => {
              const isSelected = option.code === languageCode;
              return (
                <label className="cursor-pointer" key={option.code}>
                  <input
                    checked={isSelected}
                    className="peer sr-only"
                    name="demo-clone-language"
                    onChange={() => {
                      setLanguageCode(option.code);
                      resetPlayback();
                    }}
                    type="radio"
                    value={option.code}
                  />
                  <span
                    className={`block rounded-full border px-4 py-1.5 text-sm transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring ${
                      isSelected
                        ? 'border-transparent bg-blue-600 text-white'
                        : 'border-input text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {option.label}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* Sentence picker */}
        <fieldset className="w-full border-none p-0">
          <legend className="mb-2 text-center text-muted-foreground text-sm">
            {labels.pickSentence}
          </legend>
          <div className="flex flex-col gap-2">
            {demoCloneSentences.map((option) => {
              const isSelected = option.id === sentenceId;
              return (
                <label className="cursor-pointer" key={option.id}>
                  <input
                    checked={isSelected}
                    className="peer sr-only"
                    name="demo-clone-sentence"
                    onChange={() => {
                      setSentenceId(option.id);
                      resetPlayback();
                    }}
                    type="radio"
                    value={option.id}
                  />
                  <span
                    className={`block rounded-lg border p-3 text-left text-sm transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring ${
                      isSelected
                        ? 'border-blue-600 bg-blue-600/10 text-foreground'
                        : 'border-input text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    &ldquo;{option.text[languageCode]}&rdquo;
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* Result */}
        {resultRevealed ? (
          <div
            className="flex w-full flex-col items-center gap-2 rounded-lg border bg-muted/30 p-4"
            data-clip-key={clipKey}
            data-testid="demo-clone-result"
          >
            <p className="text-muted-foreground text-sm">
              {labels.resultLabel}
            </p>
            {activeClip && (
              <AudioPlayerWithContext
                key={`result-${clipKey}-${retryNonce}`}
                onControlsReady={(controls) => {
                  resultControls.current = controls;
                }}
                onError={() => setHasAudioError(true)}
                onPlaybackStart={stopReference}
                playAudioTitle={labels.playAudio}
                progressColor="#8b5cf6"
                showWaveform
                url={activeClip.src}
                waveColor="#888888"
              />
            )}
          </div>
        ) : (
          <Button
            className="hit-area-4 w-full bg-blue-600 hover:bg-blue-700"
            data-testid="demo-clone-reveal"
            disabled={!clip}
            effect="ringHover"
            onClick={() => setResultRevealed(true)}
            size="lg"
          >
            {labels.hearResult}
          </Button>
        )}

        {hasAudioError && (
          <div
            className="flex items-center gap-3 text-destructive text-sm"
            role="alert"
          >
            <AlertCircle className="size-4 shrink-0" />
            <span>{labels.audioError}</span>
            <Button onClick={handleRetry} size="sm" variant="outline">
              {labels.retry}
            </Button>
          </div>
        )}

        <p className="text-balance text-center text-muted-foreground text-xs">
          {labels.preparedExamplesCaption}
        </p>
      </div>
    </AudioProvider>
  );
}
