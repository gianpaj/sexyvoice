import { getTranslations } from 'next-intl/server';

import { Header } from '@/components/header';
import type { Locale } from '@/lib/i18n/i18n-config';
import type { Message } from '../../reset-password/reset-password-form';
import { UpdatePasswordForm } from './update-password-form';

export default async function UpdatePasswordPage(props: {
  params: Promise<{ lang: Locale }>;
  searchParams: Promise<Message>;
}) {
  const [{ lang }, searchParams] = await Promise.all([
    props.params,
    props.searchParams,
  ]);
  const t = await getTranslations({
    locale: lang,
    namespace: 'auth.updatePassword',
  });

  return (
    <>
      <Header lang={lang} />
      <div className="flex min-h-[calc(100vh-65px)] flex-col justify-center bg-linear-to-br from-gray-900 to-gray-800 p-4 pt-11 sm:min-h-screen sm:items-center sm:pt-0">
        <div className="w-full max-w-md">
          <div className="rounded-2xl bg-background p-8 shadow-xl">
            <h1 className="mb-2 text-center font-bold text-3xl">
              {t('title')}
            </h1>
            <p className="mb-8 text-muted-foreground text-sm">
              {t('subtitle')}
            </p>
            <UpdatePasswordForm lang={lang} message={searchParams} />
          </div>
        </div>
      </div>
    </>
  );
}
