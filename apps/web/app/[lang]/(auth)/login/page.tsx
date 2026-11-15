import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import { MarketingPage } from '@/components/marketing-page';
import { getCloneDemoRedirect } from '@/lib/clone/demo-redirect';
import type { Locale } from '@/lib/i18n/i18n-config';
import { pageMetadata } from '@/lib/page-metadata';
import { LoginForm } from './login-form';

export async function generateMetadata(props: {
  params: Promise<{ lang: Locale }>;
}): Promise<Metadata> {
  const { lang } = await props.params;
  const t = await getTranslations({ locale: lang, namespace: 'pages' });
  return pageMetadata({
    description: t('descriptionLogin'),
    lang,
    path: '/login',
    title: t('titleLogin'),
  });
}

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
    <MarketingPage
      authRedirectTo={redirectTo}
      className="flex min-h-[calc(100vh-65px)] flex-col justify-center bg-linear-to-br from-gray-900 to-gray-800 p-4 pt-11 sm:min-h-screen sm:items-center sm:pt-0"
      lang={lang}
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
    </MarketingPage>
  );
}
