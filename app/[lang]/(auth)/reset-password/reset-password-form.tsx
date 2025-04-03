'use client';

import Link from 'next/link';
import { useFormStatus } from 'react-dom';

import { forgotPasswordAction } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type Message =
  | { success: string }
  | { error: string }
  | { message: string };

export function ResetPasswordForm({
  dict,
  lang,
  message,
}: {
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
          <Label htmlFor="email">{dict.email}</Label>
          <Input
            id="email"
            type="email"
            name="email"
            required
            autoComplete="current-email"
          />
        </div>
      </div>

      {'error' in message && (
        <div className="text-destructive-foreground border-l-2 border-destructive px-4 text-sm">
          {/* @ts-ignore */}
          {dict.errors[message.error as keyof typeof dict.errors]}
        </div>
      )}
      {'success' in message && (
        <div className="text-foreground border-l-2 border-foreground px-4 text-sm">
          {dict.success}
        </div>
      )}

      <Button
        type="submit"
        aria-disabled={pending}
        className="w-full"
        disabled={pending}
        formAction={forgotPasswordAction}
      >
        {pending ? dict.loading : dict.submit}
      </Button>

      <Button type="button" variant="secondary" className="w-full" asChild>
        <Link href="login">{dict.backToLogin}</Link>
      </Button>
    </form>
  );
}
