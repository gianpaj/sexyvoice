import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import Footer from '@/components/footer';
import { HeaderStatic } from '@/components/header-static';
import type { Locale } from '@/lib/i18n/i18n-config';
import { LoginForm } from './login-form';

export default async function LoginPage(props: {
  params: Promise<{ lang: Locale }>;
}) {
  const { lang } = await props.params;
  const t = await getTranslations({ locale: lang, namespace: 'auth' });

  return (
    <>
      <HeaderStatic />
      <main
        className="flex min-h-[calc(100vh-65px)] flex-col justify-center p-4 pt-11 sm:min-h-screen sm:items-center sm:pt-0 dark:bg-linear-to-br dark:from-gray-900 dark:to-gray-800"
        id="main-content"
      >
        <div className="w-full max-w-md">
          <div className="rounded-2xl bg-background p-8 shadow-xl">
            <h1 className="mb-2 text-center font-bold text-3xl">
              {t('login.title')}
            </h1>
            <p className="mb-8 text-center text-muted-foreground">
              {t('login.subtitle')}
            </p>
            <Suspense>
              <LoginForm lang={lang} />
            </Suspense>
          </div>
        </div>
      </main>
      <Footer lang={lang} />
    </>
  );
}
