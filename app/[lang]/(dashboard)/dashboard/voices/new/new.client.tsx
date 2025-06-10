'use client';

import {
  AlertCircle,
  CheckCircle,
  Download,
  Mic,
  Play,
  Upload,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

import { useRef, useState } from 'react';
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
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type Status =
  | 'idle'
  | 'uploading'
  | 'processing'
  | 'ready'
  | 'generating'
  | 'complete'
  | 'error';

type VoiceClone = {
  id: string;
  name: string;
  createdAt: string;
};
interface Props {
  voices:
    | {
        created_at: string | null;
        id: string;
        is_nsfw: boolean | null;
        is_public: boolean | null;
        language: string;
        model: string;
        name: string;
        sample_prompt: string | null;
        sample_url: string | null;
        updated_at: string | null;
        user_id: string;
      }[]
    | null;
  lang: string;
}
export default function NewVoiceClient({ voices, lang }: Props) {
  const [name, setName] = useState('');
  const [language, setLanguage] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [voiceName, setVoiceName] = useState('');
  // const [isPublic, setIsPublic] = useState(false);
  // const [isNsfw, setIsNsfw] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeTab, setActiveTab] = useState('upload');
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedVoiceId, setSelectedVoiceId] = useState('');
  const [textToConvert, setTextToConvert] = useState('');
  // const { data } = supabase.auth.getUser();
  // const user = data?.user;
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!file) {
      setError('Please upload an audio file.');
      return;
    }

    // Validate file type and size
    const allowedTypes = [
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/x-wav',
      'audio/m4a',
      'audio/x-m4a',
    ];
    if (!allowedTypes.includes(file.type)) {
      setError('Invalid file type. Only MP3, M4A, or WAV allowed.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('File too large. Max 10MB allowed.');
      return;
    }

    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', name);
      formData.append('language', language);

      const res = await fetch('/api/clone-voice', {
        method: 'POST',
        body: formData,
      });

      const result = await res.json();

      if (!res.ok) {
        setError(result.error || 'Failed to clone voice.');
        setIsLoading(false);
        return;
      }

      // Optionally: handle result.replicateOutput, etc.
      router.push(`/${lang}/dashboard/voices`);
      router.refresh();
    } catch (err: any) {
      setError(err?.message || 'Unexpected error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVoiceSelect = (voiceId: string) => {
    setSelectedVoiceId(voiceId);
    const selectedVoice = voices?.find((voice) => voice.id === voiceId);
    if (selectedVoice) {
      setVoiceName(selectedVoice.name);
      setStatus('ready');
      setActiveTab('generate');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Check file type
    const fileType = selectedFile.type;
    if (fileType !== 'audio/mpeg' && fileType !== 'audio/wav') {
      setErrorMessage('Please upload an MP3 or WAV file.');
      setStatus('error');
      return;
    }

    // We would normally check duration here, but we'll simulate it
    setFile(selectedFile);
    setErrorMessage('');
    setStatus('idle');
  };

  const handleUpload = async () => {
    if (!file) {
      setErrorMessage('Please select an audio file.');
      setStatus('error');
      return;
    }

    if (!voiceName.trim()) {
      setErrorMessage('Please enter a name for your voice clone.');
      setStatus('error');
      return;
    }

    // Simulate upload process
    setStatus('uploading');
    // setProgress(0)
  };
  const handleGenerate = () => {
    if (!textToConvert.trim()) {
      setErrorMessage('Please enter some text to convert to speech.');
      setStatus('error');
      return;
    }
    setStatus('generating');
    // setProgress(0)
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Create New Voice</CardTitle>
          <CardDescription>
            Set up a new voice clone with your preferences
            {'user' === 'user' && (
              <Alert variant="default">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Free users</AlertTitle>
                <AlertDescription>
                  Only get 1 free cloned voice - As the API is costly 3 USD per
                  new voice
                </AlertDescription>
              </Alert>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="upload">Upload</TabsTrigger>
              <TabsTrigger
                value="generate"
                disabled={status !== 'ready' && status !== 'complete'}
              >
                Generate
              </TabsTrigger>
              <TabsTrigger value="preview" disabled={status !== 'complete'}>
                Preview
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="space-y-4 py-4">
              <div className="grid w-full gap-4">
                <div className="space-y-2">
                  <Label>Select a Previously Cloned Voice</Label>
                  <Select
                    onValueChange={handleVoiceSelect}
                    value={selectedVoiceId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a voice clone" />
                    </SelectTrigger>
                    <SelectContent>
                      {voices?.map((voice) => (
                        <SelectItem key={voice.id} value={voice.id}>
                          <span className="flex items-center">
                            <span className="font-medium">
                              {voice.name} - {voice.language}
                            </span>
                            <span className="ml-2 text-xs text-muted-foreground">
                              {voice.id}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Or create a new voice clone below
                  </p>
                </div>
              </div>

              <div className="grid w-full gap-4">
                <Label htmlFor="voice-name">Voice Clone Name</Label>
                <Input
                  id="voice-name"
                  placeholder="Enter a name for your voice clone"
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value)}
                  required
                />
              </div>

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
                        MP3 or WAV (10 sec - 5 min)
                      </p>
                    </div>
                    <Input
                      id="audio-file"
                      type="file"
                      accept=".mp3,.wav,audio/mpeg,audio/wav"
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

              {status === 'error' && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              )}

              {(status === 'uploading' || status === 'processing') && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      {status === 'uploading'
                        ? 'Uploading...'
                        : 'Processing...'}
                    </p>
                    {/* <span className="text-sm text-muted-foreground">
                    {progress}%
                  </span> */}
                  </div>
                  {/* <Progress value={progress} className="w-full" /> */}
                </div>
              )}

              {status === 'ready' && selectedVoiceId === '' && (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertTitle>Success</AlertTitle>
                  <AlertDescription>
                    Your voice clone is ready. Proceed to the Generate tab.
                  </AlertDescription>
                </Alert>
              )}

              <Button
                onClick={handleUpload}
                disabled={
                  !file ||
                  !voiceName.trim() ||
                  status === 'uploading' ||
                  status === 'processing'
                }
                className="w-full"
              >
                {status === 'ready' && selectedVoiceId === ''
                  ? 'Upload Another File'
                  : 'Upload and Create Voice Clone'}
              </Button>
            </TabsContent>

            <TabsContent value="generate" className="space-y-4 py-4">
              <div className="space-y-4">
                <div className="flex items-center justify-center">
                  <Mic className="w-12 h-12 text-primary" />
                </div>
                <h3 className="text-xl font-medium text-center">
                  Voice Clone: {voiceName}
                </h3>
                <p className="text-muted-foreground text-center mb-4">
                  Enter the text you want to convert to speech using your cloned
                  voice.
                </p>

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
                </div>

                {status === 'error' && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{errorMessage}</AlertDescription>
                  </Alert>
                )}

                {status === 'generating' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Generating audio...</p>
                      {/* <span className="text-sm text-muted-foreground">{progress}%</span> */}
                    </div>
                    {/* <Progress value={progress} className="w-full" /> */}
                  </div>
                )}

                <Button
                  onClick={handleGenerate}
                  disabled={status === 'generating'}
                  className="w-full"
                >
                  Generate Speech
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="preview" className="space-y-4 py-4">
              <div className="space-y-4">
                <h3 className="text-xl font-medium text-center">
                  Generated Voice Preview
                </h3>

                <div className="border rounded-lg p-4 bg-muted/30">
                  {/* <AudioWaveform audioUrl={generatedAudioUrl || ''} /> */}
                </div>

                <div className="flex justify-center gap-4">
                  <Button variant="outline" className="flex items-center gap-2">
                    <Play className="w-4 h-4" />
                    Play
                  </Button>
                  <Button
                    // onClick={handleDownload}
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
        {/* <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Voice name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="language">Language</Label>
            <Select value={language} onValueChange={setLanguage} required>
              <SelectTrigger>
                <SelectValue placeholder="Select a language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="es">Spanish</SelectItem>
                <SelectItem value="fr">French</SelectItem>
                <SelectItem value="de">German</SelectItem>
                <SelectItem value="it">Italian</SelectItem>
                <SelectItem value="pt">Portuguese</SelectItem>
                <SelectItem value="ru">Russian</SelectItem>
                <SelectItem value="ja">Japanese</SelectItem>
                <SelectItem value="ko">Korean</SelectItem>
                <SelectItem value="zh">Chinese</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="voice-file">Voice audio file</Label>
              <Input
                id="voice-file"
                type="file"
                accept=".mp3,.m4a,.wav,audio/*"
                ref={fileInputRef}
                onChange={(e) => {
                  setFile(e.target.files?.[0] || null);
                  setError(null);
                }}
                required
              />
              <p className="text-xs text-muted-foreground">
                Upload a sample of the voice you want to clone. Must be MP3,
                M4A, or WAV format, 10 seconds to 5 minutes, and less than
                10MB.
              </p>
              {file && (
                <div className="text-xs text-muted-foreground">
                  Selected: {file.name} (
                  {(file.size / 1024 / 1024).toFixed(2)} MB)
                </div>
              )}
            </div>
            {error && <div className="text-sm text-red-600">{error}</div>}
          </div>

          <div className="flex justify-end space-x-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Creating...' : 'Create Voice'}
            </Button>
          </div>
        </form>
      </CardContent> */}
      </Card>
    </div>
  );
}
