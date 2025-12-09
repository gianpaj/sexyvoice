'use client';

import { ArrowDown } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import type langDict from '@/lib/i18n/dictionaries/en.json';
import { ConvertButton } from './components/convert-button';
import { DownloadSection } from './components/download-section';
import { DropZone } from './components/drop-zone';
import { FileInfo } from './components/file-info';
import { FormatSelector } from './components/format-selector';
import { useFFmpeg } from './hooks/use-ffmpeg';

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
      <div className="container mx-auto max-w-3xl px-4 py-12">
        <div className="mb-12 text-center">
          <h1 className="mb-4 font-bold text-4xl">{dict.title}</h1>
          <p className="text-lg text-muted-foreground">{dict.subtitle}</p>
        </div>

        <main className="rounded-lg border bg-card p-6 md:p-10">
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
                <div className="space-y-4">
                  <div className="flex justify-center">
                    <ArrowDown className="h-6 w-6 text-muted-foreground" />
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
      </div>
    </div>
  );
}
