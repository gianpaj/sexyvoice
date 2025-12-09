'use client';

import { ArrowDown, Music } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import type langDict from '@/lib/i18n/dictionaries/en.json';
import type { Locale } from '@/lib/i18n/i18n-config';
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
  lang: Locale;
}

export default function AudioConverterClient({ dict, lang }: Props) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [outputFormat, setOutputFormat] = useState<AudioFormat>('mp3');
  const [conversionState, setConversionState] =
    useState<ConversionState>('idle');
  const [progress, setProgress] = useState(0);
  const [convertedUrl, setConvertedUrl] = useState<string | null>(null);
  const { convert, isLoading: ffmpegLoading, error: ffmpegError } = useFFmpeg();

  const handleFileSelect = useCallback(
    (file: File) => {
      setSelectedFile(file);
      setConversionState('idle');
      setProgress(0);
      if (convertedUrl) {
        URL.revokeObjectURL(convertedUrl);
        setConvertedUrl(null);
      }
    },
    [convertedUrl],
  );

  const handleRemoveFile = useCallback(() => {
    setSelectedFile(null);
    setConversionState('idle');
    setProgress(0);
    if (convertedUrl) {
      URL.revokeObjectURL(convertedUrl);
      setConvertedUrl(null);
    }
  }, [convertedUrl]);

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
      if (Error.isError(error)) {
        toast.error(error.message);
      } else {
        toast.error('An unknown error occurred during conversion.');
      }
      console.error('Conversion error:', error);
      setConversionState('idle');
      setProgress(0);
    }
  }, [selectedFile, outputFormat, convert]);

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
    setConversionState('idle');
    setProgress(0);
    if (convertedUrl) {
      URL.revokeObjectURL(convertedUrl);
      setConvertedUrl(null);
    }
  }, [convertedUrl]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-3xl px-4 py-12 md:py-20">
        <header className="mb-12 animate-fade-in text-center">
          <div className="mb-6 flex flex-col items-center justify-center gap-3 md:flex-row md:gap-8">
            <div className="gradient-bg flex h-14 w-14 items-center justify-center rounded-2xl shadow-glow">
              <Music className="h-8 w-8 text-primary-foreground" />
            </div>
            <h1 className="gradient-text font-extrabold text-4xl md:text-5xl">
              {dict.title}
            </h1>
          </div>

          {/* Tagline */}
          <p className="mb-4 text-lg text-muted-foreground">
            {dict.subtitle}
            <span className="font-semibold text-foreground">
              {' '}
              – free & easy
            </span>
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
                <DropZone
                  dict={dict.dropZone}
                  onFileSelect={handleFileSelect}
                />
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
                    disabled={!selectedFile || ffmpegLoading}
                    isConverting={conversionState === 'converting'}
                    onClick={handleConvert}
                    progress={Math.min(progress, 100)}
                  />
                </div>
              )}
            </div>
          )}
        </main>

        <footer
          className="mt-12 animate-fade-in text-center text-muted-foreground text-sm"
          style={{ animationDelay: '0.4s' }}
        >
          <p>
            {dict.footer.poweredBy}{' '}
            <span className="font-semibold text-foreground">
              {dict.footer.ffmpeg}
            </span>{' '}
            • {dict.footer.noUploads}
          </p>
          <p className="mt-2 opacity-70">
            <Link
              className="transition-colors hover:text-foreground"
              href={`/${lang}`}
            >
              {dict.footer.madeWith}
            </Link>
          </p>
        </footer>
      </div>
    </div>
  );
}
