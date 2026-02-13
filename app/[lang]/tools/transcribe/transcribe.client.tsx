'use client';

import { Languages } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import type langDict from '@/lib/i18n/dictionaries/en.json';
import { AudioInput } from './components/audio-input';
import { LanguageSelector } from './components/language-selector';
import { WHISPER_MODELS, ModelSelector } from './components/model-selector';
import { ProgressDisplay } from './components/progress-display';
import { TranscriptDisplay } from './components/transcript-display';
import { useTranscriber } from './hooks/use-transcriber';
import './transcribe.css';

interface Props {
  dict: (typeof langDict)['transcribe'];
}

export default function TranscribeClient({ dict }: Props) {
  const [model, setModel] = useState('onnx-community/whisper-tiny');
  const [language, setLanguage] = useState('en');
  const [subtask, setSubtask] = useState('transcribe');
  const [hasAudio, setHasAudio] = useState(false);
  const audioRef = useRef<Float32Array | null>(null);

  const transcriber = useTranscriber();

  const isEnglishOnly =
    WHISPER_MODELS.find((m) => m.id === model)?.multilingual === false;

  const handleAudioReady = useCallback((audio: Float32Array) => {
    audioRef.current = audio;
    setHasAudio(true);
  }, []);

  const handleLoadAndTranscribe = useCallback(() => {
    if (!audioRef.current) return;

    if (transcriber.state === 'idle') {
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
  const prevStateRef = useRef(transcriber.state);
  if (
    prevStateRef.current === 'loading' &&
    transcriber.state === 'ready' &&
    audioRef.current
  ) {
    transcriber.transcribe(
      audioRef.current,
      isEnglishOnly ? 'en' : language,
      isEnglishOnly ? 'transcribe' : subtask,
    );
  }
  prevStateRef.current = transcriber.state;

  const isProcessing =
    transcriber.state === 'loading' || transcriber.state === 'transcribing';

  return (
    <>
      <header className="mb-12 animate-fade-in text-center">
        <div className="mb-6 flex flex-col items-center justify-center gap-3 md:flex-row md:gap-8">
          <div className="gradient-bg flex h-14 w-14 items-center justify-center rounded-2xl shadow-glow">
            <Languages className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="gradient-text font-extrabold text-2xl md:text-4xl">
            {dict.title}
          </h1>
        </div>

        <p className="mb-4 text-muted-foreground text-sm sm:text-md">
          {dict.subtitle}
          <span className="font-semibold text-foreground">{dict.tagline}</span>
        </p>
      </header>

      <main className="glass-card animate-fade-in rounded-3xl p-6 md:p-10">
        <div className="space-y-6">
          <AudioInput
            dict={dict.audioInput}
            disabled={isProcessing}
            onAudioReady={handleAudioReady}
          />

          {hasAudio && (
            <div className="animate-fade-in space-y-6">
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
                dict={dict.transcriptDisplay}
                partialTranscript={transcriber.partialTranscript}
                transcript={transcriber.transcript}
              />

              <div className="flex gap-3">
                <Button
                  className="flex-1"
                  disabled={isProcessing}
                  onClick={handleLoadAndTranscribe}
                  size="lg"
                >
                  {transcriber.state === 'loading'
                    ? dict.loadingModel
                    : transcriber.state === 'transcribing'
                      ? dict.transcribing
                      : transcriber.state === 'ready'
                        ? dict.transcribeButton
                        : dict.loadAndTranscribe}
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
            </div>
          )}
        </div>
      </main>
    </>
  );
}
