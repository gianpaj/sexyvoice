'use client';

import {
  AlertCircle,
  CircleStop,
  Download,
  InfoIcon,
  PaperclipIcon,
  Pause,
  Play,
  UploadIcon,
  XIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import PulsatingDots from '@/components/PulsatingDots';
import { toast } from '@/components/services/toast';
import { Accordion } from '@/components/ui/accordion';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatBytes, useFileUpload } from '@/hooks/use-file-upload';
import { downloadUrl } from '@/lib/download';
import type langDict from '@/lib/i18n/dictionaries/en.json';
import type { Locale } from '@/lib/i18n/i18n-config';
import { AudioProvider } from './audio-provider';
import type { SampleAudio } from './CloneSampleCard';
import CloneSampleCard from './CloneSampleCard';

export type Status = 'idle' | 'generating' | 'complete' | 'error';

const ALLOWED_TYPES =
  'audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/x-wav,audio/m4a,audio/x-m4a';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const sampleAudios: readonly SampleAudio[] = [
  {
    id: 1,
    name: 'Marilyn Monroe 🇺🇸',
    prompt: "I don't need diamonds, darling. I need stable Wi-Fi and a nap",
    audioSrc: 'clone-en-audio-samples/marilyn_monroe-1952.mp3',
    audioExampleOutputSrc:
      'clone-en-audio-samples/marilyn_monroe-diamonds-wifi.mp3',
    image: 'https://images.sexyvoice.ai/clone/marilyn-monroe.avif',
  },
  // {
  //   id: 2,
  //   name: 'Morgan Freeman 🇺🇸',
  //   prompt: 'The most important thing is the mission, not the money',
  //   audioExampleOutputSrc: 'clone-en-audio-samples/morgan_freeman.mp3',
  //   audioSrc: 'clone-en-audio-samples/morgan_freeman.mp3',
  // },
  // {
  //   id: 3,
  //   name: 'Audrey Hepburn 🇬🇧',
  //   prompt: 'Elegance is not about being noticed, it is about being remembered',
  //   audioExampleOutputSrc: 'clone-en-audio-samples/audrey_hepburn.mp3',
  //   audioSrc: 'clone-en-audio-samples/audrey_hepburn.mp3',
  // },
  // https://maskgct.github.io/audios/celeb_samples/rick_0.wav
];

const SUPPORTED_LOCALE_CODES = [
  'ar',
  'da',
  'de',
  'el',
  'en',
  'es',
  'fi',
  'fr',
  'he',
  'hi',
  'it',
  'ja',
  'ko',
  'ms',
  'nl',
  'no',
  'pl',
  'pt',
  'ru',
  'sv',
  'sw',
  'tr',
  'zh',
];

export default function NewVoiceClient({
  dict,
  lang,
  hasEnoughCredits,
}: {
  dict: (typeof langDict)['clone'];
  lang: Locale;
  hasEnoughCredits: boolean;
}) {
  const [status, setStatus] = useState<Status>('idle');
  const [activeTab, setActiveTab] = useState('upload');
  const [errorMessage, setErrorMessage] = useState('');
  const [textToConvert, setTextToConvert] = useState('');
  const [shortcutKey, setShortcutKey] = useState('⌘+Enter');
  const [selectedLocale, setSelectedLocale] = useState('en');
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const supportedLocales = useMemo(() => {
    const languageNames = new Intl.DisplayNames([lang], { type: 'language' });
    return SUPPORTED_LOCALE_CODES.map((code) => ({
      code,
      name:
        `${languageNames.of(code)?.charAt(0).toUpperCase()}${languageNames.of(code)?.slice(1)}` ||
        code,
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [lang]);

  const onFilesAdded = () => {
    setStatus('idle');
    setErrorMessage('');
  };

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
      addFiles,
    },
  ] = useFileUpload({
    onFilesAdded,
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
      setErrorMessage(dict.errors.noAudioFile);
      setStatus('error');
      return;
    }

    if (!textToConvert.trim()) {
      setErrorMessage(dict.errors.noText);
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
      formData.append('locale', selectedLocale);

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

      const newAudio = new Audio(voiceResult.url);

      newAudio.addEventListener('ended', () => {
        setIsPlaying(false);
      });

      setAudio(newAudio);

      // Automatically play the audio
      newAudio.play();
      setIsPlaying(true);

      toast.success(dict.success);

      setStatus('complete');
      setActiveTab('preview');
    } catch (err) {
      if (
        Error.isError(err) &&
        err.message === 'signal is aborted without reason'
      ) {
        return;
      }
      let errorMsg = 'Unexpected error occurred';
      if (voiceRes && !voiceRes.ok) {
        errorMsg = voiceRes.statusText;
      } else if (Error.isError(err)) {
        errorMsg = err.message;
      }
      setErrorMessage(errorMsg);
      setStatus('error');
    }
  }, [dict, file, textToConvert, selectedLocale, clearErrors]);

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
          textToConvert.trim() &&
          hasEnoughCredits
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
  }, [status, textToConvert, handleGenerate, hasEnoughCredits]);

  const downloadAudio = async () => {
    // Prepare the anchor element once in a closure scope
    const anchorElement = document.createElement('a');
    document.body.appendChild(anchorElement);
    anchorElement.style.display = 'none';

    if (!audio?.src) return;

    try {
      await downloadUrl(audio.src, anchorElement);
    } catch {
      toast.error(dict.errorCloning);
    }
  };

  const togglePlayback = () => {
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{dict.title}</CardTitle>
        <CardDescription>
          <p className="mb-4">{dict.subtitle}</p>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs className="w-full" onValueChange={setActiveTab} value={activeTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upload">{dict.tabUpload}</TabsTrigger>
            <TabsTrigger disabled={status !== 'complete'} value="preview">
              {dict.tabPreview}
            </TabsTrigger>
          </TabsList>

          <TabsContent className="space-y-6 py-4" value="upload">
            <div className="grid w-full gap-6">
              <div className="grid w-full gap-2">
                <Label htmlFor="audio-file">{dict.audioFileLabel}</Label>

                {/* Drop area */}
                {!file && (
                  <button
                    className="flex min-h-32 flex-col items-center justify-center rounded-xl border border-input border-dashed p-4 transition-colors hover:bg-accent/50 has-disabled:pointer-events-none has-[input:focus]:border-ring has-disabled:opacity-50 has-[input:focus]:ring-[3px] has-[input:focus]:ring-ring/50 data-[dragging=true]:bg-accent/50"
                    data-dragging={isDragging || undefined}
                    onClick={openFileDialog}
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onKeyUp={openFileDialog}
                    type="button"
                  >
                    <input
                      {...getInputProps()}
                      aria-label="Upload audio file"
                      className="sr-only"
                      disabled={Boolean(file)}
                    />

                    <div className="flex flex-col items-center justify-center text-center">
                      <div
                        aria-hidden="true"
                        className="mb-2 flex size-11 shrink-0 items-center justify-center rounded-full border bg-background"
                      >
                        <UploadIcon className="size-4 opacity-60" />
                      </div>
                      <p className="mb-1.5 font-medium text-sm">
                        {dict.uploadAudioFile}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {dict.dragDropText}
                      </p>
                      <p className="mt-1 text-muted-foreground text-xs">
                        {dict.fileFormatsText.replace(
                          '__SIZE__',
                          formatBytes(MAX_FILE_SIZE),
                        )}
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
                {file ? (
                  <div
                    className="flex items-center justify-between gap-2 rounded-xl border px-4 py-2"
                    key={files[0]?.id}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <PaperclipIcon
                        aria-hidden="true"
                        className="size-4 shrink-0 opacity-60"
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
                      aria-label="Remove file"
                      className="-me-2 size-12 text-muted-foreground/80 hover:bg-transparent hover:text-foreground"
                      onClick={() => removeFile(files[0]?.id)}
                      size="icon"
                      variant="ghost"
                    >
                      <XIcon aria-hidden="true" className="!size-6" />
                    </Button>
                  </div>
                ) : (
                  // Sample audio demo buttons
                  <div className="grid w-full gap-2">
                    <p className="text-muted-foreground text-xs">
                      {dict.tryDemo}
                    </p>

                    <Accordion
                      className="w-full"
                      collapsible
                      defaultValue={sampleAudios[0].id.toString()}
                      type="single"
                    >
                      <AudioProvider>
                        {sampleAudios.map((sample) => (
                          <CloneSampleCard
                            addFiles={addFiles}
                            dict={dict}
                            key={sample.id}
                            sample={sample}
                            setErrorMessage={setErrorMessage}
                            setStatus={setStatus}
                            setTextToConvert={setTextToConvert}
                          />
                        ))}
                      </AudioProvider>
                    </Accordion>
                  </div>
                )}
              </div>

              <div className="grid w-full gap-2">
                <Label htmlFor="language">{dict.languageLabel}</Label>
                <Select
                  disabled={status === 'generating'}
                  onValueChange={setSelectedLocale}
                  value={selectedLocale}
                >
                  <SelectTrigger id="language">
                    <SelectValue placeholder={dict.languageSelectPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {supportedLocales.map((locale) => (
                      <SelectItem key={locale.code} value={locale.code}>
                        {locale.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid w-full gap-2">
                <Label htmlFor="text-to-convert">
                  {dict.textToConvertLabel}
                </Label>
                <textarea
                  className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={status === 'generating'}
                  id="text-to-convert"
                  onChange={(e) => setTextToConvert(e.target.value)}
                  placeholder={dict.textAreaPlaceholder}
                  value={textToConvert}
                />
              </div>
            </div>

            {status === 'error' && errorMessage && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>{dict.errorTitle}</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}

            {!hasEnoughCredits && (
              <Alert className="mx-auto w-fit" variant="destructive">
                <AlertDescription>{dict.notEnoughCredits}</AlertDescription>
              </Alert>
            )}

            <Button
              className="w-full"
              disabled={
                !(file && textToConvert.trim()) ||
                status === 'generating' ||
                !hasEnoughCredits
              }
              onClick={handleGenerate}
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
                className="mx-auto"
                onClick={handleCancel}
                variant="outline"
              >
                {dict.cancelButton}{' '}
                <CircleStop className="size-4" name="cancel" />
              </Button>
            )}
          </TabsContent>

          <TabsContent className="space-y-4 py-4" value="preview">
            <div className="space-y-4">
              <h3 className="text-center font-medium text-xl">
                {dict.previewTitle}
              </h3>

              <div className="mx-auto w-fit rounded-lg border bg-muted/30 p-4">
                {/* <AudioWaveform audioUrl={generatedAudioUrl || ''} /> */}
                {/*<AudioPlayer url={generatedAudioUrl} />*/}
                <Button
                  className="rounded-full"
                  onClick={togglePlayback}
                  size="icon"
                  variant="secondary"
                >
                  {isPlaying ? (
                    <Pause className="size-6" />
                  ) : (
                    <Play className="size-6" />
                  )}
                </Button>
              </div>

              <div className="flex justify-center gap-4">
                <Button
                  className="flex items-center gap-2"
                  onClick={downloadAudio}
                >
                  <Download className="h-4 w-4" />
                  {dict.downloadAudio}
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="flex items-center justify-between gap-3 border-t pt-6">
        <p className="text-muted-foreground text-sm">{dict.cloneNotice}</p>
        <TooltipProvider>
          <Tooltip supportMobileTap>
            <TooltipTrigger aria-label={dict.cloneNoticeTooltipLabel} asChild>
              <button
                className="text-muted-foreground transition-colors hover:text-foreground"
                type="button"
              >
                <InfoIcon aria-hidden="true" className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent
              align="end"
              className="max-w-[80vw] whitespace-pre text-wrap lg:max-w-[50vw]"
              side="left"
            >
              {dict.cloneNoticeTooltip}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </CardFooter>
    </Card>
  );
}
