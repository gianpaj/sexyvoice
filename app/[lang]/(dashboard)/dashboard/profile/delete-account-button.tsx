'use client';

import { OctagonAlert } from 'lucide-react';

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
import type langDict from '@/lib/i18n/dictionaries/en.json';
import type { Locale } from '@/lib/i18n/i18n-config';

export function DeleteAccountButton({
  lang,
  dict,
}: {
  lang: Locale;
  dict: (typeof langDict)['profile'];
}) {
  const handleDeleteAccount = async () => {
    await handleDeleteAccountAction({ lang });
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          className="block text-left text-destructive hover:underline"
          type="button"
        >
          {dict.dangerZone.deleteAccount.button}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader className="items-center">
          <AlertDialogTitle>
            <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
              <OctagonAlert className="h-7 w-7 text-destructive" />
            </div>
            {dict.dangerZone.deleteAccount.confirmTitle}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center text-[15px]">
            {dict.dangerZone.deleteAccount.confirmDescription}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-2 sm:justify-center">
          <AlertDialogCancel>
            {dict.dangerZone.deleteAccount.cancel}
          </AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: 'destructive' })}
            onClick={handleDeleteAccount}
          >
            {dict.dangerZone.deleteAccount.continue}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
