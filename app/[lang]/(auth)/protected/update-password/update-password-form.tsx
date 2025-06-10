'use client';

import { useFormStatus } from 'react-dom';

import { updatePasswordAction } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Message } from '../../reset-password/reset-password-form';

export function UpdatePasswordForm({
  dict,
  lang,
  message,
}: {
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  dict: any;
  lang: string;
  message: Message;
}) {
  const { pending } = useFormStatus();

  return (
    <form className="space-y-4">
      <input type="hidden" name="lang" value={lang} />
      <div className="flex flex-col gap-6">
        <div className="grid gap-2">
          <Label htmlFor="password">{dict.newPassword}</Label>
          <Input
            id="password"
            type="password"
            name="password"
            autoFocus
            required
            autoComplete="new-password"
            minLength={6}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="confirmPassword">{dict.confirmPassword}</Label>
          <Input
            id="confirmPassword"
            type="password"
            name="confirmPassword"
            required
            autoComplete="new-password"
            minLength={6}
          />
        </div>
      </div>

      {'error' in message && (
        <div className="text-destructive-foreground border-l-2 border-destructive px-4 text-sm">
          {/* @ts-ignore */}
          {dict.errors[message.error as keyof typeof dict.errors]}
        </div>
      )}

      <Button
        type="submit"
        className="w-full"
        formAction={updatePasswordAction}
        aria-disabled={pending}
        disabled={pending}
      >
        {pending ? dict.loading : dict.updatePassword}
      </Button>
    </form>
  );
}
