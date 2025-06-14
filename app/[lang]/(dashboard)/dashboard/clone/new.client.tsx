'use client';

import {
  AlertCircle,
  CheckCircle,
  CircleStop,
  Download,
  PaperclipIcon,
  UploadIcon,
  XIcon,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import PulsatingDots from '@/components/PulsatingDots';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
// import { Progress } from '@/components/ui/progress';
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatBytes, useFileUpload } from '@/hooks/use-file-upload';
import type lang from '@/lib/i18n/dictionaries/en.json';
import { AudioPlayer } from '../history/audio-player';

type Status = 'idle' | 'generating' | 'complete' | 'error';

const ALLOWED_TYPES =
  'audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/x-wav,audio/m4a,audio/x-m4a';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export default function NewVoiceClient({
  dict,
}: {
  dict: (typeof lang)['generate'];
}) {
  const [status, setStatus] = useState<Status>('idle');
  const [activeTab, setActiveTab] = useState('upload');
  const [errorMessage, setErrorMessage] = useState('');
  const [textToConvert, setTextToConvert] = useState('');
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState('');
  const [shortcutKey, setShortcutKey] = useState('⌘+Enter');

  const [
    { files, isDragging, errors },
    {
      handleDragEnter,
      handleDragLeave,
      handleDragOver,
      handleDrop,
      openFileDialog,
      removeFile,
      getInputProps,
      clearErrors,
    },
  ] = useFileUpload({
    maxSize: MAX_FILE_SIZE,
    accept: ALLOWED_TYPES,
    multiple: false,
  });

  const file = files[0]?.file instanceof File ? files[0].file : null;

  useEffect(() => {
    // Check if running on Mac for keyboard shortcut display
    const isMac =
      navigator.platform.toUpperCase().indexOf('MAC') >= 0 ||
      navigator.userAgent.toUpperCase().indexOf('MAC') >= 0;
    setShortcutKey(isMac ? '⌘+Enter' : 'Ctrl+Enter');
  }, []);

  // Clear custom error message when file upload errors change
  useEffect(() => {
    if (errors.length > 0) {
      setErrorMessage('');
    }
  }, [errors]);

  const abortController = useRef<AbortController | null>(null);
  const handleGenerate = useCallback(async () => {
    if (!file) {
      setErrorMessage('Please select an audio file.');
      setStatus('error');
      return;
    }

    if (!textToConvert.trim()) {
      setErrorMessage('Please enter some text to convert to speech.');
      setStatus('error');
      return;
    }

    // Clear both custom errors and file upload errors
    setErrorMessage('');
    clearErrors();
    setStatus('generating');

    try {
      abortController.current = new AbortController();
      // First upload and process the voice
      const formData = new FormData();
      formData.append('file', file);
      formData.append('text', textToConvert);

      const voiceRes = await fetch('/api/clone-voice', {
        method: 'POST',
        body: formData,
        signal: abortController.current.signal,
      });

      const voiceResult = await voiceRes.json();

      if (!voiceRes.ok) {
        setErrorMessage(
          voiceResult.message ||
            voiceResult.error ||
            dict.errorCloning ||
            'Failed to clone voice.',
        );
        setStatus('error');
        return;
      }

      setGeneratedAudioUrl(voiceResult.url);

      setStatus('complete');
      setActiveTab('preview');
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        err.message === 'signal is aborted without reason'
      ) {
        setErrorMessage(dict.abortedCloning || 'Voice generation aborted.');
      } else {
        setErrorMessage(
          err instanceof Error ? err.message : 'Unexpected error occurred',
        );
      }
      setStatus('error');
    }
  }, [dict, file, textToConvert, clearErrors]);

  // Keyboard shortcut handler
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for CMD+Enter on Mac or Ctrl+Enter on other platforms
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();

        // Only trigger if form can be submitted
        if (
          status !== 'generating' &&
          textToConvert.trim()
          // && hasEnoughCredits
        ) {
          handleGenerate();
        }
      }
    };

    // Add event listener to document
    document.addEventListener('keydown', handleKeyDown);

    // Cleanup
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [status, textToConvert, handleGenerate]);

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = generatedAudioUrl;
    link.target = '_blank';
    link.download = 'generated_audio.mp3';
    link.click();
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Clone a Voice</CardTitle>
          <CardDescription>
            <p className="mb-4">
              Upload an audio file and enter text to create a voice clone and
              generate speech in one step
            </p>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* TODO add examples */}
          {/* https://maskgct.github.io/audios/celeb_samples/rick_0.wav */}
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="upload">Create Voice</TabsTrigger>
              <TabsTrigger value="preview" disabled={status !== 'complete'}>
                Preview
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="space-y-6 py-4">
              <div className="grid w-full gap-4">
                <div className="grid w-full gap-2">
                  <Label htmlFor="audio-file">Audio File</Label>

                  {/* Drop area */}
                  <button
                    type="button"
                    onClick={openFileDialog}
                    onKeyUp={openFileDialog}
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    data-dragging={isDragging || undefined}
                    className="border-input hover:bg-accent/50 data-[dragging=true]:bg-accent/50 has-[input:focus]:border-ring has-[input:focus]:ring-ring/50 flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed p-4 transition-colors has-disabled:pointer-events-none has-disabled:opacity-50 has-[input:focus]:ring-[3px]"
                  >
                    <input
                      {...getInputProps()}
                      className="sr-only"
                      aria-label="Upload audio file"
                      disabled={Boolean(file)}
                    />

                    <div className="flex flex-col items-center justify-center text-center">
                      <div
                        className="bg-background mb-2 flex size-11 shrink-0 items-center justify-center rounded-full border"
                        aria-hidden="true"
                      >
                        <UploadIcon className="size-4 opacity-60" />
                      </div>
                      <p className="mb-1.5 text-sm font-medium">
                        Upload audio file
                      </p>
                      <p className="text-muted-foreground text-xs">
                        Drag & drop or click to browse
                      </p>
                      <p className="text-muted-foreground text-xs mt-1">
                        MP3, WAV, M4A or OGG (max. {formatBytes(MAX_FILE_SIZE)})
                      </p>
                    </div>
                  </button>

                  {/* File upload errors */}
                  {errors.length > 0 && (
                    <div
                      className="text-destructive flex items-center gap-1 text-xs"
                      role="alert"
                    >
                      <AlertCircle className="size-3 shrink-0" />
                      <span>{errors[0]}</span>
                    </div>
                  )}

                  {/* Selected file display */}
                  {file && (
                    <div className="space-y-2">
                      <div
                        key={files[0]?.id}
                        className="flex items-center justify-between gap-2 rounded-xl border px-4 py-2"
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <PaperclipIcon
                            className="size-4 shrink-0 opacity-60"
                            aria-hidden="true"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-medium">
                              {file.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatBytes(file.size)}
                            </p>
                          </div>
                        </div>

                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-muted-foreground/80 hover:text-foreground -me-2 size-8 hover:bg-transparent"
                          onClick={() => removeFile(files[0]?.id)}
                          aria-label="Remove file"
                        >
                          <XIcon className="size-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid w-full gap-2">
                  <Label htmlFor="text-to-convert">Text to Convert</Label>
                  <textarea
                    id="text-to-convert"
                    className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder={dict.textAreaPlaceholder}
                    value={textToConvert}
                    onChange={(e) => setTextToConvert(e.target.value)}
                    disabled={status === 'generating'}
                  />
                </div>
              </div>

              {status === 'error' && errorMessage && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              )}

              <Button
                onClick={handleGenerate}
                disabled={
                  !file || !textToConvert.trim() || status === 'generating'
                  // || !hasEnoughCredits
                }
                className="w-full"
              >
                {status === 'generating' ? (
                  <span className="flex items-center">
                    {dict.generating}
                    <span className="inline-flex ml-1">
                      <PulsatingDots />
                    </span>
                  </span>
                ) : (
                  <>
                    <span>{dict.ctaButton}</span>
                    <span className="text-xs text-gray-300 opacity-70 border-[1px] rounded-sm border-gray-400 p-1">
                      {shortcutKey}
                    </span>
                  </>
                )}
              </Button>
              {status === 'generating' && (
                <Button
                  variant="outline"
                  onClick={() => abortController.current?.abort()}
                  className="mx-auto"
                >
                  Cancel <CircleStop name="cancel" className="size-4" />
                </Button>
              )}
            </TabsContent>

            <TabsContent value="preview" className="space-y-4 py-4">
              <div className="space-y-4">
                <h3 className="text-xl font-medium text-center">
                  Generated Voice Preview
                </h3>

                <div className="border rounded-lg p-4 bg-muted/30 w-fit mx-auto">
                  {/* <AudioWaveform audioUrl={generatedAudioUrl || ''} /> */}
                  <AudioPlayer url={generatedAudioUrl} />
                </div>

                <div className="flex justify-center gap-4">
                  <Button
                    onClick={handleDownload}
                    className="flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    {dict.downloadAudio}
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter className="flex justify-between border-t pt-6">
          <p className="text-sm text-muted-foreground">
            Voice clones are created for demonstration purposes only.
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
