'use client';

import { useFormStatus } from 'react-dom';

import { updatePasswordAction } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type langDict from '@/lib/i18n/dictionaries/en.json';
import type { Locale } from '@/lib/i18n/i18n-config';
import type { Message } from '../../reset-password/reset-password-form';

export function UpdatePasswordForm({
  dict,
  lang,
  message,
}: {
  dict: (typeof langDict)['auth']['updatePassword'];
  lang: Locale;
  message: Message;
}) {
  const { pending } = useFormStatus();

  return (
    <form className="space-y-4">
      <input name="lang" type="hidden" value={lang} />
      <div className="flex flex-col gap-6">
        <div className="grid gap-2">
          <Label htmlFor="password">{dict.newPassword}</Label>
          <Input
            autoComplete="new-password"
            autoFocus
            id="password"
            minLength={6}
            name="password"
            required
            type="password"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="confirmPassword">{dict.confirmPassword}</Label>
          <Input
            autoComplete="new-password"
            id="confirmPassword"
            minLength={6}
            name="confirmPassword"
            required
            type="password"
          />
        </div>
      </div>

      {'error' in message && (
        <div className="border-destructive border-l-2 px-4 text-destructive-foreground text-sm">
          {/* @ts-ignore */}
          {dict.errors[message.error as keyof typeof dict.errors]}
        </div>
      )}

      <Button
        aria-disabled={pending}
        className="w-full"
        disabled={pending}
        formAction={updatePasswordAction}
        type="submit"
      >
        {pending ? dict.loading : dict.updatePassword}
      </Button>
    </form>
  );
}
