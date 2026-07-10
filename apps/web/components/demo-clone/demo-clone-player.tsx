'use client';

import { AlertCircle } from 'lucide-react';
import Image from 'next/image';
import { useRef, useState } from 'react';

import {
  type AudioPlayerControls,
  AudioPlayerWithContext,
} from '@/components/audio-player-with-context';
import { AudioProvider } from '@/components/audio-provider';
import { Button } from '@/components/ui/button';
import {
  type DemoLanguageCode,
  demoCloneSpeakers,
  getDemoCloneSpeaker,
} from '@/data/demo-clone';

export interface DemoCloneLabels {
  audioError: string;
  hearResult: string;
  pickSpeaker: string;
  playAudio: string;
  preparedExamplesCaption: string;
  referenceLabel: string;
  resultLabel: string;
  retry: string;
}

interface DemoClonePlayerProps {
  initialSpeakerId: string;
  labels: DemoCloneLabels;
  /** Localized language names, keyed by the code each speaker is tagged with. */
  languageLabels: Record<DemoLanguageCode, string>;
}

export function DemoClonePlayer({
  initialSpeakerId,
  labels,
  languageLabels,
}: DemoClonePlayerProps) {
  const [speakerId, setSpeakerId] = useState(initialSpeakerId);
  const [resultRevealed, setResultRevealed] = useState(false);
  const [hasAudioError, setHasAudioError] = useState(false);
  // Bumped to remount the players, forcing wavesurfer to refetch after a retry.
  const [retryNonce, setRetryNonce] = useState(0);

  const referenceControls = useRef<AudioPlayerControls | null>(null);
  const resultControls = useRef<AudioPlayerControls | null>(null);

  const speaker = getDemoCloneSpeaker(speakerId);

  const stopResult = () => resultControls.current?.stop();
  const stopReference = () => referenceControls.current?.stop();

  // Switching speakers stops playback. Handled here rather than in an effect
  // because both players remount on the speaker change anyway; the stop calls
  // silence the outgoing audio before React tears the players down.
  const handleSpeakerChange = (nextSpeakerId: string) => {
    stopReference();
    stopResult();
    setHasAudioError(false);
    setSpeakerId(nextSpeakerId);
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
          <legend className="mb-2 w-full text-center text-muted-foreground text-sm">
            {labels.pickSpeaker}
          </legend>
          <div className="flex items-center justify-center gap-6">
            {demoCloneSpeakers.map((option) => {
              const isSelected = option.id === speakerId;
              return (
                <label
                  className="group flex cursor-pointer flex-col items-center gap-1.5"
                  data-testid={`demo-clone-speaker-${option.id}`}
                  key={option.id}
                >
                  <input
                    checked={isSelected}
                    className="peer sr-only"
                    name="demo-clone-speaker"
                    onChange={() => handleSpeakerChange(option.id)}
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
                  <span className="text-[11px] text-muted-foreground">
                    {languageLabels[option.languageCode]}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* Reference clip */}
        <div className="flex w-fit flex-col items-center gap-2 rounded-lg border bg-muted/30 p-4">
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
            url={speaker.reference.src}
            waveColor="#888888"
          />
        </div>

        {/* Script the cloned voice speaks */}
        <blockquote
          className="w-full rounded-lg border border-input p-3 text-left text-muted-foreground text-sm"
          data-testid="demo-clone-script"
          lang={speaker.languageCode}
        >
          &ldquo;{speaker.script}&rdquo;
        </blockquote>

        {/* Result */}
        {resultRevealed ? (
          <div
            className="flex w-fit flex-col items-center gap-2 rounded-lg border bg-muted/30 p-4"
            data-speaker-id={speaker.id}
            data-testid="demo-clone-result"
          >
            <p className="text-muted-foreground text-sm">
              {labels.resultLabel}
            </p>
            <AudioPlayerWithContext
              key={`result-${speaker.id}-${retryNonce}`}
              onControlsReady={(controls) => {
                resultControls.current = controls;
              }}
              onError={() => setHasAudioError(true)}
              onPlaybackStart={stopReference}
              playAudioTitle={labels.playAudio}
              progressColor="#8b5cf6"
              showWaveform
              url={speaker.result.src}
              waveColor="#888888"
            />
          </div>
        ) : (
          <Button
            className="hit-area-4 w-full bg-blue-600 hover:bg-blue-700"
            data-testid="demo-clone-reveal"
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
