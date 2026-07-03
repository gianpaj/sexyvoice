'use client';

import { useTranslations } from 'next-intl';
import { useFormStatus } from 'react-dom';

import { updatePasswordAction } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Locale } from '@/lib/i18n/i18n-config';
import type { Message } from '../../reset-password/reset-password-form';

export function UpdatePasswordForm({
  lang,
  message,
}: {
  lang: Locale;
  message: Message;
}) {
  const t = useTranslations('auth.updatePassword');
  const { pending } = useFormStatus();

  return (
    <form className="space-y-4">
      <input name="lang" type="hidden" value={lang} />
      <div className="flex flex-col gap-6">
        <div className="grid gap-2">
          <Label htmlFor="password">{t('newPassword')}</Label>
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
          <Label htmlFor="confirmPassword">{t('confirmPassword')}</Label>
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
          {t.has(`errors.${message.error}` as Parameters<typeof t>[0])
            ? t(`errors.${message.error}` as Parameters<typeof t>[0])
            : message.error}
        </div>
      )}

      <Button
        aria-disabled={pending}
        className="w-full"
        disabled={pending}
        formAction={updatePasswordAction}
        type="submit"
      >
        {pending ? t('loading') : t('updatePassword')}
      </Button>
    </form>
  );
}
