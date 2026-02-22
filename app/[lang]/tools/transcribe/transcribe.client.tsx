'use client';

import { Languages } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { AudioPlayer } from '@/components/audio-player';
import { Button } from '@/components/ui/button';
import type langDict from '@/lib/i18n/dictionaries/en.json';
import type { Locale } from '@/lib/i18n/i18n-config';
import { AudioInput } from './components/audio-input';
import { LanguageSelector } from './components/language-selector';
import { ModelSelector, WHISPER_MODELS } from './components/model-selector';
import { ProgressDisplay } from './components/progress-display';
import { TranscriptDisplay } from './components/transcript-display';
import { useTranscriber } from './hooks/use-transcriber';
import './transcribe.css';

interface Props {
  lang: Locale;
  dict: (typeof langDict)['transcribe'];
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

  const transcriber = useTranscriber();

  const isEnglishOnly =
    WHISPER_MODELS.find((m) => m.id === model)?.multilingual === false;

  const handleAudioReady = useCallback((audio: Float32Array) => {
    audioRef.current = audio;
    setHasAudio(true);
  }, []);

  const handleFileSelected = useCallback(
    (file: File) => {
      if (audioFileUrl) {
        URL.revokeObjectURL(audioFileUrl);
      }
      setAudioFileUrl(URL.createObjectURL(file));
      setCurrentTime(null);
    },
    [audioFileUrl],
  );

  // Revoke blob URL on unmount
  useEffect(() => {
    return () => {
      if (audioFileUrl) {
        URL.revokeObjectURL(audioFileUrl);
      }
    };
  }, [audioFileUrl]);

  const handleRemoveAudio = useCallback(() => {
    audioRef.current = null;
    setHasAudio(false);
    transcriber.reset();
  }, [transcriber]);

  const handleLoadAndTranscribe = useCallback(() => {
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
  }, [transcriber, model, language, subtask, isEnglishOnly]);

  // Auto-transcribe when model becomes ready
  useEffect(() => {
    if (
      transcriber.state === 'ready' &&
      audioRef.current &&
      loadedModelRef.current !== model
    ) {
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

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  return (
    <>
      <header className="mb-12 animate-fade-in text-center">
        {/* Ambient waveform decoration */}
        <div
          className="mb-5 flex items-end justify-center gap-[3px] opacity-40"
          style={{ height: '28px' }}
        >
          {[10, 18, 26, 14, 28, 20, 24, 12, 22, 16, 28, 18].map(
            (height, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: static decorative array
                key={i}
                className="wave-bar"
                style={{
                  height: `${height}px`,
                  animationDelay: `${i * 0.09}s`,
                }}
              />
            ),
          )}
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
