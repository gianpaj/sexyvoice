'use client';

import { AlertCircle, CheckCircle, Download, Upload } from 'lucide-react';
import { useState } from 'react';
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
import { Input } from '@/components/ui/input';
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
import { AudioPlayer } from '../history/audio-player';

type Status = 'idle' | 'ready' | 'generating' | 'complete' | 'error';

type VoiceClone = {
  id: string;
  name: string;
  createdAt: string;
};

export default function NewVoiceClient() {
  const [status, setStatus] = useState<Status>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [activeTab, setActiveTab] = useState('upload');
  const [errorMessage, setErrorMessage] = useState('');
  const [textToConvert, setTextToConvert] = useState('');
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Check file type
    const fileType = selectedFile.type;
    if (
      fileType !== 'audio/mpeg' &&
      fileType !== 'audio/wav' &&
      fileType !== 'audio/ogg'
    ) {
      setErrorMessage('Please upload an MP3, WAV, or OGG file.');
      setStatus('error');
      return;
    }

    // We would normally check duration here, but we'll simulate it
    setFile(selectedFile);
    setErrorMessage('');
    setStatus('idle');
  };

  const handleGenerate = async () => {
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

    setErrorMessage('');
    setStatus('generating');

    try {
      // First upload and process the voice
      const formData = new FormData();
      formData.append('file', file);
      formData.append('text', textToConvert);

      const voiceRes = await fetch('/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const voiceResult = await voiceRes.json();

      if (!voiceRes.ok) {
        setErrorMessage(
          voiceResult.message || voiceResult.error || 'Failed to clone voice.',
        );
        setStatus('error');
        return;
      }

      setGeneratedAudioUrl(voiceResult.url);

      setStatus('complete');
      setActiveTab('preview');
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unexpected error occurred',
      );
      setStatus('error');
    }
  };

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
                  <div className="flex items-center justify-center w-full">
                    <label
                      htmlFor="audio-file"
                      className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-muted/50 hover:bg-muted"
                    >
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <Upload className="w-8 h-8 mb-2 text-muted-foreground" />
                        <p className="mb-2 text-sm text-muted-foreground">
                          <span className="font-semibold">Click to upload</span>{' '}
                          or drag and drop
                        </p>
                        <p className="text-xs text-muted-foreground">
                          MP3, WAV, or OGG (10 sec - 1 min)
                        </p>
                      </div>
                      <Input
                        id="audio-file"
                        type="file"
                        accept=".mp3,.wav,.opus,audio/mpeg,audio/wav,audio/ogg"
                        className="hidden"
                        onChange={handleFileChange}
                      />
                    </label>
                  </div>
                  {file && (
                    <p className="text-sm text-muted-foreground mt-2">
                      Selected file: {file.name} (
                      {(file.size / (1024 * 1024)).toFixed(2)} MB)
                    </p>
                  )}
                </div>

                <div className="grid w-full gap-2">
                  <Label htmlFor="text-to-convert">Text to Convert</Label>
                  <textarea
                    id="text-to-convert"
                    className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="Enter the text you want to convert to speech..."
                    value={textToConvert}
                    onChange={(e) => setTextToConvert(e.target.value)}
                    disabled={status === 'generating'}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter the text you want to convert to speech using your
                    uploaded voice
                  </p>
                </div>
              </div>

              {status === 'error' && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              )}

              {status === 'ready' && (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertTitle>Voice Ready</AlertTitle>
                  <AlertDescription>
                    Your voice has been processed. You can now generate speech
                    with your text.
                  </AlertDescription>
                </Alert>
              )}

              <Button
                onClick={handleGenerate}
                disabled={
                  !file || !textToConvert.trim() || status === 'generating'
                }
                className="w-full"
              >
                {status === 'generating' ? (
                  <span className="flex items-center">
                    {'Generating'}
                    <span className="inline-flex ml-1">
                      <span className="animate-[pulse_1.4s_ease-in-out_infinite]">
                        .
                      </span>
                      <span className="animate-[pulse_1.4s_ease-in-out_0.4s_infinite]">
                        .
                      </span>
                      <span className="animate-[pulse_1.4s_ease-in-out_0.8s_infinite]">
                        .
                      </span>
                    </span>
                  </span>
                ) : (
                  <span>{'Generate'}</span>
                )}
              </Button>
              {status === 'generating' && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => abortController.current?.abort()}
                >
                  <CircleStop name="cancel" className="size-4" />
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
                    Download
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
