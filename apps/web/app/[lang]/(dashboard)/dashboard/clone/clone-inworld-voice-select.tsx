'use client';

import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { toast } from '@/components/services/toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AudioReference, AudioReferenceSelection } from './clone-state';

// Reusable saved-voice picker (Clone page + Call page). Callback-based so it is
// not tied to any particular state container.
export function CloneInworldVoiceSelect({
  disabled,
  loading,
  onChange,
  onVoiceDeleted,
  value,
  voices,
}: {
  disabled: boolean;
  loading: boolean;
  onChange: (value: AudioReferenceSelection) => void;
  onVoiceDeleted: (deletedId: string) => void;
  value: AudioReferenceSelection;
  voices: AudioReference[];
}) {
  const t = useTranslations('clone');
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const selectedVoice =
    value === 'new'
      ? null
      : (voices.find((voice) => voice.id === value) ?? null);

  const handleDelete = async () => {
    if (!selectedVoice) {
      return;
    }

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/audio-references/${selectedVoice.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Failed to delete voice');
      }

      onVoiceDeleted(selectedVoice.id);
      setIsOpen(false);
      toast.success(t('voiceDeleted'));
    } catch {
      toast.error(t('errors.failedToDeleteVoice'));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="grid w-full gap-2">
      <Label htmlFor="inworld-voice">{t('inworldVoiceLabel')}</Label>
      <div className="flex items-center gap-2">
        <Select
          disabled={disabled || loading}
          onValueChange={(next) => onChange(next as AudioReferenceSelection)}
          value={value}
        >
          <SelectTrigger
            className="w-56"
            data-testid="clone-inworld-voice-select"
            id="inworld-voice"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="new">{t('inworldVoiceNew')}</SelectItem>
            {voices.map((voice) => (
              <SelectItem key={voice.id} value={voice.id}>
                {voice.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedVoice && (
          <AlertDialog onOpenChange={setIsOpen} open={isOpen}>
            <AlertDialogTrigger asChild>
              <Button
                aria-label={t('deleteVoice')}
                disabled={disabled}
                size="icon"
                type="button"
                variant="outline"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('deleteVoiceTitle')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('deleteVoiceDescription')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('cancelButton')}</AlertDialogCancel>
                <AlertDialogAction asChild>
                  <Button
                    disabled={isDeleting}
                    onClick={async (event) => {
                      // Keep the dialog open until the request resolves;
                      // handleDelete closes it on success and handles its own errors.
                      event.preventDefault();
                      await handleDelete();
                    }}
                    variant="destructive"
                  >
                    {isDeleting
                      ? `${t('deleteVoiceConfirm')}...`
                      : t('deleteVoiceConfirm')}
                  </Button>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}
