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
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  dict: any;
  lang: string;
  message: Message;
}) {
  const { pending } = useFormStatus();

  return (
    <form className="space-y-4">
      <input name="lang" type="hidden" value={lang} />
      <div className="flex flex-col gap-6">
        <div className="grid gap-2">
          <Label htmlFor="email">{dict.email}</Label>
          <Input
            autoComplete="current-email"
            id="email"
            name="email"
            required
            type="email"
          />
        </div>
      </div>

      {'error' in message && (
        <div className="border-destructive border-l-2 px-4 text-destructive-foreground text-sm">
          {/* @ts-ignore */}
          {dict.errors[message.error as keyof typeof dict.errors]}
        </div>
      )}
      {'success' in message && (
        <div className="border-foreground border-l-2 px-4 text-foreground text-sm">
          {dict.success}
        </div>
      )}

      <Button
        aria-disabled={pending}
        className="w-full"
        disabled={pending}
        formAction={forgotPasswordAction}
        type="submit"
      >
        {pending ? dict.loading : dict.submit}
      </Button>

      <Button asChild className="w-full" type="button" variant="secondary">
        <Link href="login">{dict.backToLogin}</Link>
      </Button>
    </form>
  );
}
