'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { DBVoice } from '@/data/voices';
import type langDict from '@/lib/i18n/dictionaries/en.json';

export interface NewCharacterPayload {
  name: string;
  description: string;
  voiceName: string;
  prompt: string;
}

interface CreateCharacterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  callVoices: DBVoice[];
  onSave: (character: NewCharacterPayload) => Promise<void>;
  dict: (typeof langDict)['call']['createCharacter'];
}

function VoicePlayButton({
  voiceName,
  sampleUrl,
  dict,
}: {
  voiceName: string;
  sampleUrl: string | null;
  dict: (typeof langDict)['call']['createCharacter'];
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlay = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (!sampleUrl) return;

    if (!audioRef.current) {
      audioRef.current = new Audio(sampleUrl);
      audioRef.current.onended = () => setIsPlaying(false);
      audioRef.current.onerror = () => setIsPlaying(false);
    }

    if (isPlaying) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    } else {
      audioRef.current.src = sampleUrl;
      audioRef.current.play().catch(() => setIsPlaying(false));
      setIsPlaying(true);
    }
  };

  useEffect(
    () => () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    },
    [],
  );

  // Stop playing when voice changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: we want to stop when voiceName changes, not when isPlaying changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  }, [voiceName]);

  if (!sampleUrl) return null;

  return (
    <Button
      aria-label={isPlaying ? dict.stopVoiceSample : dict.playVoiceSample}
      className="min-h-9 min-w-9 shrink-0"
      onClick={handlePlay}
      size="icon"
      title={dict.previewVoice.replace('__VOICE__', voiceName)}
      type="button"
      variant="outline"
    >
      {isPlaying ? (
        <svg
          aria-hidden="true"
          className="text-fg1"
          fill="currentColor"
          height="12"
          viewBox="0 0 14 14"
          width="12"
        >
          <rect height="10" rx="0.5" width="3" x="3" y="2" />
          <rect height="10" rx="0.5" width="3" x="8" y="2" />
        </svg>
      ) : (
        <svg
          aria-hidden="true"
          className="text-fg1"
          fill="currentColor"
          height="12"
          viewBox="0 0 14 14"
          width="12"
        >
          <path d="M3 2.5v9a.5.5 0 00.75.43l7.5-4.5a.5.5 0 000-.86l-7.5-4.5A.5.5 0 003 2.5z" />
        </svg>
      )}
    </Button>
  );
}

export function CreateCharacterDialog({
  open,
  onOpenChange,
  callVoices,
  onSave,
  dict,
}: CreateCharacterDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [voiceName, setVoiceName] = useState(callVoices[0]?.name ?? '');
  const [prompt, setPrompt] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const selectedVoice = callVoices.find((v) => v.name === voiceName);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setName('');
      setDescription('');
      setVoiceName(callVoices[0]?.name ?? '');
      setPrompt('');
    }
  }, [open, callVoices]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error(dict.errorNameRequired);
      return;
    }
    if (!voiceName) {
      toast.error(dict.errorVoiceRequired);
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        voiceName,
        prompt: prompt.trim(),
      });
      onOpenChange(false);
    } catch (error) {
      // Error handling is done in the parent via onSave
      console.error('Failed to save character:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-popover sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{dict.dialogTitle}</DialogTitle>
          <DialogDescription>{dict.dialogDescription}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Name (required, editable) */}
          <div className="grid gap-2">
            <Label htmlFor="char-name">
              {dict.nameLabel}{' '}
              <span className="text-destructive">{dict.nameRequired}</span>
            </Label>
            <Input
              autoFocus
              id="char-name"
              maxLength={50}
              onChange={(e) => setName(e.target.value)}
              placeholder={dict.namePlaceholder}
              value={name}
            />
          </div>

          {/* Description (optional, editable) */}
          <div className="grid gap-2">
            <Label htmlFor="char-description">{dict.descriptionLabel}</Label>
            <Input
              id="char-description"
              maxLength={200}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={dict.descriptionPlaceholder}
              value={description}
            />
          </div>

          {/* Voice selection (dropdown + play button) */}
          <div className="grid gap-2">
            <Label>{dict.voiceLabel}</Label>
            <div className="flex items-center gap-2">
              <Select onValueChange={setVoiceName} value={voiceName}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder={dict.voicePlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {callVoices.map((voice) => (
                    <SelectItem key={voice.id} value={voice.name}>
                      <span className="flex items-center gap-2">
                        <span>{voice.name}</span>
                        {voice.type && (
                          <span className="text-muted-foreground text-xs">
                            — {voice.type}
                          </span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <VoicePlayButton
                dict={dict}
                sampleUrl={selectedVoice?.sample_url ?? null}
                voiceName={voiceName}
              />
            </div>
            {selectedVoice?.description && (
              <p className="text-muted-foreground text-xs">
                {selectedVoice.description}
              </p>
            )}
          </div>

          {/* Prompt / Instructions (editable textarea) */}
          <div className="grid gap-2">
            <Label htmlFor="char-prompt">{dict.instructionsLabel}</Label>
            <Textarea
              className="min-h-32 resize-y"
              id="char-prompt"
              maxLength={5000}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={dict.instructionsPlaceholder}
              rows={6}
              value={prompt}
            />
            <p className="text-muted-foreground text-xs">
              {dict.characterCount.replace(
                '__COUNT__',
                prompt.length.toString(),
              )}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            {dict.cancelButton}
          </Button>
          <Button disabled={isSaving || !name.trim()} onClick={handleSave}>
            {isSaving ? dict.creatingButton : dict.createButton}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
