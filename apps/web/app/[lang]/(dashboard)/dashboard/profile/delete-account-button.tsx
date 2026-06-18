'use client';

import { OctagonAlert } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { handleDeleteAccountAction } from '@/app/actions';
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
import { buttonVariants } from '@/components/ui/button';

export function DeleteAccountButton() {
  const t = useTranslations('profile.dangerZone.deleteAccount');
  const locale = useLocale();

  const handleDeleteAccount = async () => {
    await handleDeleteAccountAction({ lang: locale });
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          className="block text-left text-destructive hover:underline"
          type="button"
        >
          {t('button')}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader className="items-center">
          <AlertDialogTitle>
            <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
              <OctagonAlert className="h-7 w-7 text-destructive" />
            </div>
            {t('confirmTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center text-[15px]">
            {t('confirmDescription')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-2 sm:justify-center">
          <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: 'destructive' })}
            onClick={handleDeleteAccount}
          >
            {t('continue')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
