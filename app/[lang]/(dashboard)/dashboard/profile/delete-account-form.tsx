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
import type dictType from '@/lib/i18n/dictionaries/en.json';

export function DeleteAccountForm({
  lang,
  dict,
}: {
  lang: string;
  dict: typeof dictType;
}) {
  const handleDeleteAccount = async () => {
    await handleDeleteAccountAction({ lang });
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4">
        <Alert variant="destructive" className="p-4">
          <AlertCircle className="size-4" />
          <AlertDescription>
            {dict.profile.dangerZone.deleteAccount.alertTitle}
          </AlertDescription>
        </Alert>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {/* <div className="space-y-2">
          <Label htmlFor="currentPassword">Confirm</Label>
        </div> */}

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <div className="flex justify-end">
              <Button variant="destructive">
                {dict.profile.dangerZone.deleteAccount.button}
              </Button>
            </div>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader className="items-center">
              <AlertDialogTitle>
                <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
                  <OctagonAlert className="h-7 w-7 text-destructive" />
                </div>
                {dict.profile.dangerZone.deleteAccount.confirmTitle}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-center text-[15px]">
                {dict.profile.dangerZone.deleteAccount.confirmDescription}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-2 sm:justify-center">
              <AlertDialogCancel>
                {dict.profile.dangerZone.deleteAccount.cancel}
              </AlertDialogCancel>
              <AlertDialogAction
                className={buttonVariants({ variant: 'destructive' })}
                onClick={handleDeleteAccount}
              >
                {dict.profile.dangerZone.deleteAccount.continue}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
