'use client';

import {
  AlertCircle,
  CircleStop,
  Download,
  PaperclipIcon,
  UploadIcon,
  XIcon,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import PulsatingDots from '@/components/PulsatingDots';
import { toast } from '@/components/services/toast';
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
import { downloadUrl } from '@/lib/download';
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

    let voiceRes: Response | undefined;
    try {
      abortController.current = new AbortController();
      // First upload and process the voice
      const formData = new FormData();
      formData.append('file', file);
      formData.append('text', textToConvert);

      voiceRes = await fetch('/api/clone-voice', {
        method: 'POST',
        body: formData,
        signal: abortController.current.signal,
      });

      if (!voiceRes.ok) {
        const voiceResult = await voiceRes.json();
        setErrorMessage(
          voiceResult.message ||
            voiceResult.error ||
            dict.errorCloning ||
            'Failed to clone voice.',
        );
        setStatus('error');
        return;
      }
      const voiceResult = await voiceRes.json();

      setGeneratedAudioUrl(voiceResult.url);

      setStatus('complete');
      setActiveTab('preview');
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        err.message === 'signal is aborted without reason'
      ) {
        return;
      }
      let errorMsg = 'Unexpected error occurred';
      if (voiceRes && !voiceRes.ok) {
        errorMsg = voiceRes.statusText;
      } else if (err instanceof Error) {
        errorMsg = err.message;
      }
      setErrorMessage(errorMsg);
      setStatus('error');
    }
  }, [dict, file, textToConvert, clearErrors]);

  const handleCancel = () => {
    abortController.current?.abort();
    setStatus('idle');
  };

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

  const downloadAudio = async () => {
    // Prepare the anchor element once in a closure scope
    const anchorElement = document.createElement('a');
    document.body.appendChild(anchorElement);
    anchorElement.style.display = 'none';

    if (!generatedAudioUrl) return;

    try {
      await downloadUrl(generatedAudioUrl, anchorElement);
    } catch {
      toast.error(dict.error);
    }
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
                  {!file && (
                    <button
                      type="button"
                      onClick={openFileDialog}
                      onKeyUp={openFileDialog}
                      onDragEnter={handleDragEnter}
                      onDragLeave={handleDragLeave}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      data-dragging={isDragging || undefined}
                      className="flex min-h-32 flex-col items-center justify-center rounded-xl border border-input border-dashed p-4 transition-colors hover:bg-accent/50 has-disabled:pointer-events-none has-[input:focus]:border-ring has-disabled:opacity-50 has-[input:focus]:ring-[3px] has-[input:focus]:ring-ring/50 data-[dragging=true]:bg-accent/50"
                    >
                      <input
                        {...getInputProps()}
                        className="sr-only"
                        aria-label="Upload audio file"
                        disabled={Boolean(file)}
                      />

                      <div className="flex flex-col items-center justify-center text-center">
                        <div
                          className="mb-2 flex size-11 shrink-0 items-center justify-center rounded-full border bg-background"
                          aria-hidden="true"
                        >
                          <UploadIcon className="size-4 opacity-60" />
                        </div>
                        <p className="mb-1.5 font-medium text-sm">
                          Upload audio file
                        </p>
                        <p className="text-muted-foreground text-xs">
                          Drag & drop or click to browse
                        </p>
                        <p className="mt-1 text-muted-foreground text-xs">
                          MP3, WAV, M4A or OGG (max.{' '}
                          {formatBytes(MAX_FILE_SIZE)})
                        </p>
                      </div>
                    </button>
                  )}

                  {/* File upload errors */}
                  {errors.length > 0 && (
                    <div
                      className="flex items-center gap-1 text-destructive text-xs"
                      role="alert"
                    >
                      <AlertCircle className="size-3 shrink-0" />
                      <span>{errors[0]}</span>
                    </div>
                  )}

                  {/* Selected file display */}
                  {file && (
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
                          <p className="truncate whitespace-normal break-all font-medium text-[13px]">
                            {file.name}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {formatBytes(file.size)}
                          </p>
                        </div>
                      </div>

                      <Button
                        size="icon"
                        variant="ghost"
                        className="-me-2 size-12 text-muted-foreground/80 hover:bg-transparent hover:text-foreground"
                        onClick={() => removeFile(files[0]?.id)}
                        aria-label="Remove file"
                      >
                        <XIcon className="!size-6" aria-hidden="true" />
                      </Button>
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
                  !(file && textToConvert.trim()) || status === 'generating'
                  // || !hasEnoughCredits
                }
                className="w-full"
              >
                {status === 'generating' ? (
                  <span className="flex items-center">
                    {dict.generating}
                    <span className="ml-1 inline-flex">
                      <PulsatingDots />
                    </span>
                  </span>
                ) : (
                  <>
                    <span>{dict.ctaButton}</span>
                    <span className="rounded-sm border-[1px] border-gray-400 p-1 text-gray-300 text-xs opacity-70">
                      {shortcutKey}
                    </span>
                  </>
                )}
              </Button>
              {status === 'generating' && (
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  className="mx-auto"
                >
                  Cancel <CircleStop name="cancel" className="size-4" />
                </Button>
              )}
            </TabsContent>

            <TabsContent value="preview" className="space-y-4 py-4">
              <div className="space-y-4">
                <h3 className="text-center font-medium text-xl">
                  Generated Voice Preview
                </h3>

                <div className="mx-auto w-fit rounded-lg border bg-muted/30 p-4">
                  {/* <AudioWaveform audioUrl={generatedAudioUrl || ''} /> */}
                  <AudioPlayer url={generatedAudioUrl} />
                </div>

                <div className="flex justify-center gap-4">
                  <Button
                    onClick={downloadAudio}
                    className="flex items-center gap-2"
                  >
                    <Download className="h-4 w-4" />
                    {dict.downloadAudio}
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter className="flex justify-between border-t pt-6">
          <p className="text-muted-foreground text-sm">
            Voice clones are created for demonstration purposes only.
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
