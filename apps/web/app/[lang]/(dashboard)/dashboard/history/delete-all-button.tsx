'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import type { AudioFileAndVoicesRes } from '@/lib/supabase/queries.client';
import { handleDeleteAllAction } from './actions';

interface DeleteAllButtonProps {
  count: number;
  disabled: boolean;
  userId: string;
}

export function DeleteAllButton({
  count,
  disabled,
  userId,
}: DeleteAllButtonProps) {
  const t = useTranslations('history.delete');
  const queryClient = useQueryClient();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const handleDeleteAll = async () => {
    setIsDeleting(true);

    try {
      await handleDeleteAllAction();
      queryClient.setQueryData<AudioFileAndVoicesRes[]>(
        ['audio_files', userId],
        [],
      );
      setIsOpen(false);
      toast.success(t('all.success'));
    } catch (error) {
      console.error('Failed to delete all audio files:', error);
      toast.error(t('all.error'));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (!isDeleting) setIsOpen(open);
      }}
      open={isOpen}
    >
      <AlertDialogTrigger asChild>
        <Button
          aria-label={t('all.trigger')}
          disabled={disabled}
          size="sm"
          type="button"
          variant="destructive"
        >
          <Trash2 />
          <span className="hidden sm:inline">{t('all.trigger')}</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('all.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('all.description', { count })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>
            {t('cancel')}
          </AlertDialogCancel>
          <Button
            disabled={isDeleting}
            onClick={handleDeleteAll}
            type="button"
            variant="destructive"
          >
            {isDeleting ? t('deleting') : t('all.confirm')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
