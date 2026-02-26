'use client';

import { ArrowDown, Music } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import type langDict from '@/lib/i18n/dictionaries/en.json';
import { ConvertButton } from './components/convert-button';
import { DownloadSection } from './components/download-section';
import { DropZone } from './components/drop-zone';
import { FileInfo } from './components/file-info';
import { FormatSelector } from './components/format-selector';
import { useFFmpeg } from './hooks/use-ffmpeg';
import './audio-converter.css';

type AudioFormat = 'mp3' | 'wav' | 'ogg' | 'aac' | 'flac' | 'm4a' | 'mp4';
type ConversionState = 'idle' | 'converting' | 'complete';

interface Props {
  dict: (typeof langDict)['audioConverter'];
}

export default function AudioConverterClient({ dict }: Props) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [outputFormat, setOutputFormat] = useState<AudioFormat>('mp3');
  const [conversionState, setConversionState] =
    useState<ConversionState>('idle');
  const [progress, setProgress] = useState(0);
  const [convertedUrl, setConvertedUrl] = useState<string | null>(null);
  const { convert, isLoading: ffmpegLoading, error: ffmpegError } = useFFmpeg();

  // Show toast notification when FFmpeg fails to load
  useEffect(() => {
    if (ffmpegError) {
      toast.error(dict.errors.converterLoadFailed);
    }
  }, [ffmpegError, dict.errors]);

  const isDisabled = ffmpegLoading || !!ffmpegError;

  const resetConversionState = useCallback(() => {
    setConversionState('idle');
    setProgress(0);
    if (convertedUrl) {
      URL.revokeObjectURL(convertedUrl);
      setConvertedUrl(null);
    }
  }, [convertedUrl]);

  const handleFileSelect = useCallback(
    (file: File) => {
      setSelectedFile(file);
      resetConversionState();
    },
    [resetConversionState],
  );

  const handleRemoveFile = useCallback(() => {
    setSelectedFile(null);
    resetConversionState();
  }, [resetConversionState]);

  const handleConvert = useCallback(async () => {
    if (!selectedFile) return;

    setConversionState('converting');
    setProgress(0);

    try {
      const result = await convert(selectedFile, outputFormat, (p) => {
        setProgress(Math.min(p * 100, 100));
      });

      const url = URL.createObjectURL(result);
      setConvertedUrl(url);
      setConversionState('complete');
      setProgress(100);
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error('An unknown error occurred during conversion.');
      }
      console.error('Conversion error:', error);
      resetConversionState();
    }
  }, [selectedFile, outputFormat, convert, resetConversionState]);

  const handleDownload = useCallback(() => {
    if (!(convertedUrl && selectedFile)) return;

    const a = document.createElement('a');
    a.href = convertedUrl;
    const baseName = selectedFile.name.split('.').slice(0, -1).join('.');
    a.download = `${baseName}.${outputFormat}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [convertedUrl, selectedFile, outputFormat]);

  const handleConvertAnother = useCallback(() => {
    setSelectedFile(null);
    resetConversionState();
  }, [resetConversionState]);

  return (
    <>
      <header className="mb-12 animate-fade-in text-center">
        <div className="mb-6 flex flex-col items-center justify-center gap-3 md:flex-row md:gap-8">
          <div className="gradient-bg flex h-14 w-14 items-center justify-center rounded-2xl shadow-glow">
            <Music className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="gradient-text font-extrabold text-2xl md:text-4xl">
            {dict.title}
          </h1>
        </div>

        {/* Tagline */}
        <p className="mb-4 text-muted-foreground text-sm sm:text-md">
          {dict.subtitle}
          <span className="font-semibold text-foreground">{dict.tagline}</span>
        </p>
      </header>

      <main className="glass-card animate-fade-in rounded-3xl p-6 md:p-10">
        {conversionState === 'complete' ? (
          <DownloadSection
            dict={dict.downloadSection}
            fileName={selectedFile?.name || 'audio'}
            format={outputFormat}
            onConvertAnother={handleConvertAnother}
            onDownload={handleDownload}
          />
        ) : (
          <div className="space-y-6">
            {selectedFile ? (
              <FileInfo
                dict={dict.fileInfo}
                disabled={conversionState === 'converting'}
                file={selectedFile}
                onRemove={handleRemoveFile}
              />
            ) : (
              <DropZone dict={dict.dropZone} onFileSelect={handleFileSelect} />
            )}

            {selectedFile && (
              <div className="animate-fade-in space-y-4">
                <div className="flex justify-center">
                  <ArrowDown className="h-6 w-6 animate-bounce-subtle text-muted-foreground" />
                </div>

                <FormatSelector
                  dict={dict.formatSelector}
                  disabled={conversionState === 'converting'}
                  onChange={setOutputFormat}
                  value={outputFormat}
                />

                <ConvertButton
                  dict={dict.convertButton}
                  disabled={isDisabled}
                  isConverting={conversionState === 'converting'}
                  onClick={handleConvert}
                  progress={Math.min(progress, 100)}
                />

                {ffmpegError && (
                  <p className="text-center text-destructive text-sm">
                    {dict.errors.converterFailedToLoad}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}
