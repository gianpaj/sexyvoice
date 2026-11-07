'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

import { toast } from '@/components/services/toast';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import type { SavedCallVoice } from '@/lib/call-voices';

/**
 * Confirms and deletes a saved voice. Characters that use it are named,
 * because they need a new voice before their next call.
 */
export function DeleteSavedVoiceDialog({
  voice,
  usedBy,
  onClose,
  onDeleted,
}: {
  voice: SavedCallVoice | null;
  usedBy: string[];
  onClose: () => void;
  onDeleted: (voice: SavedCallVoice) => void;
}) {
  const t = useTranslations('clone.savedVoice');
  const locale = useLocale();
  const [deleting, setDeleting] = useState(false);

  const deleteVoice = async () => {
    if (!voice) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/audio-references/${voice.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error(`Delete failed (${response.status})`);
      onDeleted(voice);
      toast.success(t('deleted', { name: voice.name }));
      onClose();
    } catch (error) {
      console.error('Failed to delete saved voice:', error);
      toast.error(t('deleteFailed'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (!(open || deleting)) onClose();
      }}
      open={voice !== null}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('deleteTitle', { name: voice?.name ?? '' })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {usedBy.length > 0
              ? t('deleteUsedBy', {
                  names: new Intl.ListFormat(locale).format(usedBy),
                })
              : t('deleteBody')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>
            {t('cancel')}
          </AlertDialogCancel>
          <Button
            disabled={deleting}
            onClick={deleteVoice}
            type="button"
            variant="destructive"
          >
            {t('deleteConfirm')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
