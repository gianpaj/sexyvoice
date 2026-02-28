'use client';

import { AlertCircle, OctagonAlert } from 'lucide-react';

import { handleDeleteAccountAction } from '@/app/actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import type langDict from '@/lib/i18n/dictionaries/en.json';
import type { Locale } from '@/lib/i18n/i18n-config';

export function DeleteAccountForm({
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
    <div className="space-y-6">
      {/*<div className="grid gap-4">*/}
      <Alert variant="destructive">
        <div className="flex items-center gap-3">
          <AlertCircle className="size-4" />
          <AlertDescription>
            {dict.dangerZone.deleteAccount.alertTitle}
          </AlertDescription>
        </div>
      </Alert>
      {/*</div>*/}

      {/*<div className="grid grid-cols-1 gap-4">*/}
      {/* <div className="space-y-2">
          <Label htmlFor="currentPassword">Confirm</Label>
        </div> */}

      <AlertDialog>
        <div className="flex justify-end">
          <AlertDialogTrigger asChild>
            <Button variant="destructive">
              {dict.dangerZone.deleteAccount.button}
            </Button>
          </AlertDialogTrigger>
        </div>
        <AlertDialogContent>
          <AlertDialogHeader className="items-center">
            <AlertDialogTitle>
              <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
                <OctagonAlert className="h-7 w-7 text-destructive" />
              </div>
              {dict.dangerZone.deleteAccount.confirmTitle}
            </AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-line text-left">
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
      {/*</div>*/}
    </div>
  );
}
