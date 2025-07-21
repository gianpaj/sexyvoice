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

export function DeleteAccountForm({ lang }: { lang: string }) {
  const handleDeleteAccount = async () => {
    await handleDeleteAccountAction({ lang });
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4">
        <Alert variant="destructive" className="p-4">
          <AlertCircle className="size-4" />
          <AlertDescription>
            Confirm you want to delete your account
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
              <Button variant="destructive">Delete account</Button>
            </div>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader className="items-center">
              <AlertDialogTitle>
                <div className="mb-2 mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
                  <OctagonAlert className="h-7 w-7 text-destructive" />
                </div>
                Are you absolutely sure?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-[15px] text-center">
                This action cannot be undone. This will permanently delete your
                account and remove your data from our servers.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-2 sm:justify-center">
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className={buttonVariants({ variant: 'destructive' })}
                onClick={handleDeleteAccount}
              >
                Continue
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
