import { Suspense } from 'react';

import { getMessages } from 'next-intl/server';

import Footer from '@/components/footer';
import { Header } from '@/components/header';
import type { Locale } from '@/lib/i18n/i18n-config';
import { LoginForm } from './login-form';

export default async function LoginPage(props: {
  params: { lang: Locale };
}) {
  const { lang } = props.params;

  const dict = (await getMessages({ locale: lang })) as IntlMessages;

  return (
    <>
      <Header lang={lang} />
      <main
        className="flex min-h-[calc(100vh-65px)] flex-col justify-center p-4 pt-11 sm:min-h-screen sm:items-center sm:pt-0 dark:bg-gradient-to-br dark:from-gray-900 dark:to-gray-800"
        id="main-content"
      >
        <div className="w-full max-w-md">
          <div className="rounded-2xl bg-background p-8 shadow-xl">
            <h1 className="mb-2 text-center font-bold text-3xl">
              {dict.auth.login.title}
            </h1>
            <p className="mb-8 text-center text-muted-foreground">
              {dict.auth.login.subtitle}
            </p>
            <Suspense>
              <LoginForm dict={dict.auth.login} lang={lang} />
            </Suspense>
          </div>
        </div>
      </main>
      <Footer lang={lang} />
    </>
  );
}
