'use client';

import { Brain } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

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
import { Button, buttonVariants } from '@/components/ui/button';

export function DeleteMemoryForm() {
  const t = useTranslations('profile.memory');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteMemories = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch('/api/memories', { method: 'DELETE' });
      if (!res.ok) {
        throw new Error('Failed to delete memories');
      }
      toast.success(t('success'));
    } catch {
      toast.error(t('error'));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog>
      <div className="flex justify-end">
        <AlertDialogTrigger asChild>
          <Button disabled={isDeleting} variant="destructive">
            {t('button')}
          </Button>
        </AlertDialogTrigger>
      </div>
      <AlertDialogContent data-testid="delete-memory-dialog">
        <AlertDialogHeader className="items-center">
          <AlertDialogTitle>
            <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
              <Brain className="h-7 w-7 text-destructive" />
            </div>
            {t('confirmTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription className="whitespace-break-spaces text-left text-[15px]">
            {t('confirmDescription')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-2 sm:justify-center">
          <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: 'destructive' })}
            disabled={isDeleting}
            onClick={handleDeleteMemories}
          >
            {t('continue')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
