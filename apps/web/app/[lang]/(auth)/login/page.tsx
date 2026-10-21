import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import Footer from '@/components/footer';
import { HeaderStatic } from '@/components/header-static';
import { getCloneDemoRedirect } from '@/lib/clone/demo-redirect';
import type { Locale } from '@/lib/i18n/i18n-config';
import { LoginForm } from './login-form';

export default async function LoginPage(props: {
  params: Promise<{ lang: Locale }>;
  searchParams?: Promise<{ redirect_to?: string | string[] }>;
}) {
  const [{ lang }, searchParams] = await Promise.all([
    props.params,
    props.searchParams ?? Promise.resolve({ redirect_to: undefined }),
  ]);
  const redirectTo = getCloneDemoRedirect(searchParams.redirect_to);
  const t = await getTranslations({ locale: lang, namespace: 'auth' });

  return (
    <>
      <HeaderStatic authRedirectTo={redirectTo} />
      <main
        className="flex min-h-[calc(100vh-65px)] flex-col justify-center bg-linear-to-br from-gray-900 to-gray-800 p-4 pt-11 sm:min-h-screen sm:items-center sm:pt-0"
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
