'use client';

import { Languages } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { AudioPlayer } from '@/components/audio-player';
import { Button } from '@/components/ui/button';
import type { Locale } from '@/lib/i18n/i18n-config';
import type langDict from '@/messages/en.json';
import { AudioInput } from './components/audio-input';
import { LanguageSelector } from './components/language-selector';
import { ModelSelector, WHISPER_MODELS } from './components/model-selector';
import { ProgressDisplay } from './components/progress-display';
import { TranscriptDisplay } from './components/transcript-display';
import { useTranscriber } from './hooks/use-transcriber';
import './transcribe.css';

interface Props {
  dict: (typeof langDict)['transcribe'];
  lang: Locale;
}

export default function TranscribeClient({ lang, dict }: Props) {
  const [model, setModel] = useState('onnx-community/whisper-tiny');
  const [language, setLanguage] = useState<string>(lang);
  const [subtask, setSubtask] = useState('transcribe');
  const [hasAudio, setHasAudio] = useState(false);
  const [audioFileUrl, setAudioFileUrl] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  const audioRef = useRef<Float32Array | null>(null);
  const loadedModelRef = useRef<string | null>(null);
  const prevStateRef = useRef<string>('idle');

  const transcriber = useTranscriber();

  const isEnglishOnly =
    WHISPER_MODELS.find((m) => m.id === model)?.multilingual === false;

  const handleAudioReady = (audio: Float32Array) => {
    audioRef.current = audio;
    setHasAudio(true);
  };

  const handleFileSelected = (file: File) => {
    if (audioFileUrl) {
      URL.revokeObjectURL(audioFileUrl);
    }
    setAudioFileUrl(URL.createObjectURL(file));
    setCurrentTime(null);
  };

  // Revoke blob URL on unmount
  useEffect(() => {
    return () => {
      if (audioFileUrl) {
        URL.revokeObjectURL(audioFileUrl);
      }
    };
  }, [audioFileUrl]);

  const handleRemoveAudio = () => {
    audioRef.current = null;
    setHasAudio(false);
    transcriber.reset();
  };

  const handleLoadAndTranscribe = () => {
    if (!audioRef.current) return;

    if (transcriber.state === 'idle' || loadedModelRef.current !== model) {
      transcriber.loadModel(model, true);
    } else if (transcriber.state === 'ready') {
      transcriber.transcribe(
        audioRef.current,
        isEnglishOnly ? 'en' : language,
        isEnglishOnly ? 'transcribe' : subtask,
      );
    }
  };

  // Auto-transcribe when model finishes loading (loading → ready transition)
  useEffect(() => {
    const justLoaded =
      prevStateRef.current === 'loading' && transcriber.state === 'ready';
    prevStateRef.current = transcriber.state;

    if (justLoaded && audioRef.current) {
      loadedModelRef.current = model;
      transcriber.transcribe(
        audioRef.current,
        isEnglishOnly ? 'en' : language,
        isEnglishOnly ? 'transcribe' : subtask,
      );
    }
  }, [transcriber, transcriber.state, model, language, subtask, isEnglishOnly]);

  const isProcessing =
    transcriber.state === 'loading' || transcriber.state === 'transcribing';

  const buttonLabel: Record<string, string> = {
    loading: dict.loadingModel,
    transcribing: dict.transcribing,
    ready: dict.transcribeButton,
    idle: dict.loadAndTranscribe,
  };

  const handleTimeUpdate = (time: number) => {
    setCurrentTime(time);
  };

  return (
    <>
      <header className="mb-12 animate-fade-in text-center">
        {/* Ambient waveform decoration */}
        <div
          className="mb-5 flex items-end justify-center gap-[3px] opacity-40"
          style={{ height: '28px' }}
        >
          {[
            { key: 'hero-wave-1', height: 10, delay: '0s' },
            { key: 'hero-wave-2', height: 18, delay: '0.09s' },
            { key: 'hero-wave-3', height: 26, delay: '0.18s' },
            { key: 'hero-wave-4', height: 14, delay: '0.27s' },
            { key: 'hero-wave-5', height: 28, delay: '0.36s' },
            { key: 'hero-wave-6', height: 20, delay: '0.45s' },
            { key: 'hero-wave-7', height: 24, delay: '0.54s' },
            { key: 'hero-wave-8', height: 12, delay: '0.63s' },
            { key: 'hero-wave-9', height: 22, delay: '0.72s' },
            { key: 'hero-wave-10', height: 16, delay: '0.81s' },
            { key: 'hero-wave-11', height: 28, delay: '0.9s' },
            { key: 'hero-wave-12', height: 18, delay: '0.99s' },
          ].map((wave) => (
            <div
              className="wave-bar"
              key={wave.key}
              style={{
                height: `${wave.height}px`,
                animationDelay: wave.delay,
              }}
            />
          ))}
        </div>

        <div className="mb-5 flex flex-col items-center justify-center gap-3 md:flex-row md:gap-4">
          <div className="gradient-bg flex h-12 w-12 items-center justify-center rounded-2xl shadow-glow">
            <Languages className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="gradient-text font-extrabold text-3xl leading-tight md:text-5xl">
            {dict.title}
          </h1>
        </div>

        <p className="mx-auto mb-4 max-w-md text-muted-foreground text-sm sm:text-base">
          {dict.subtitle}
          <span className="font-semibold text-foreground">{dict.tagline}</span>
        </p>
      </header>

      <main className="glass-card animate-fade-in rounded-3xl p-4 md:p-10">
        <div className="space-y-6">
          <AudioInput
            dict={dict.audioInput}
            disabled={isProcessing}
            onAudioReady={handleAudioReady}
            onFileSelected={handleFileSelected}
            onRemove={handleRemoveAudio}
          />

          {hasAudio && (
            <div className="flex animate-fade-in flex-col gap-8">
              <ModelSelector
                dict={dict.modelSelector}
                disabled={isProcessing}
                onChange={setModel}
                value={model}
              />

              <LanguageSelector
                dict={dict.languageSelector}
                disabled={isProcessing}
                isEnglishOnly={isEnglishOnly}
                lang={lang}
                onChange={setLanguage}
                onSubtaskChange={setSubtask}
                subtask={subtask}
                value={language}
              />

              <ProgressDisplay
                dict={dict.progress}
                isTranscribing={transcriber.state === 'transcribing'}
                progress={transcriber.downloadProgress}
              />

              {transcriber.error && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
                  <p className="text-destructive text-sm">
                    {transcriber.error}
                  </p>
                </div>
              )}

              <TranscriptDisplay
                currentTime={currentTime}
                dict={dict.transcriptDisplay}
                partialTranscript={transcriber.partialTranscript}
                transcript={transcriber.transcript}
              />

              <div className="flex items-center gap-3">
                <Button
                  className="flex-1"
                  disabled={isProcessing}
                  onClick={handleLoadAndTranscribe}
                  size="lg"
                >
                  {buttonLabel[transcriber.state]}
                </Button>

                {transcriber.transcript && (
                  <Button
                    onClick={transcriber.reset}
                    size="lg"
                    variant="outline"
                  >
                    {dict.reset}
                  </Button>
                )}
              </div>

              {transcriber.transcript && audioFileUrl && (
                <AudioPlayer
                  className="mx-auto w-1/4 md:w-1/6"
                  onTimeUpdate={handleTimeUpdate}
                  url={audioFileUrl}
                />
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
