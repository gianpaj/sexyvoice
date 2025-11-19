import { Sparkles } from 'lucide-react';

import Footer from '@/components/footer';
import { Header } from '@/components/header';
import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Locale } from '@/lib/i18n/i18n-config';
import { SignUpForm } from './signup-form';

export default async function SignUpPage(props: {
  params: Promise<{ lang: Locale }>;
}) {
  const params = await props.params;

  const { lang } = params;

  const dict = await getDictionary(lang);

  return (
    <>
      <Header lang={lang} />
      <main
        id="main-content"
        className="flex min-h-[calc(100vh-65px)] flex-col justify-center p-4 pt-11 sm:min-h-screen sm:items-center sm:pt-0 dark:bg-gradient-to-br dark:from-gray-900 dark:to-gray-800"
      >
        <div className="mx-auto my-4 inline-flex items-center rounded-full bg-blue-500/10 px-4 py-2 text-blue-400 dark:bg-blue-600/20">
          <Sparkles className="mr-2 size-4" aria-hidden />
          <span>{dict.landing.cta.freeCredits}</span>
        </div>
        <div className="w-full max-w-md">
          <div className="rounded-2xl bg-background p-8 shadow-xl">
            <h1 className="mb-2 text-center font-bold text-3xl">
              {dict.auth.signup.title}
            </h1>
            <p className="mb-8 text-center text-muted-foreground">
              {dict.auth.signup.subtitle}
            </p>
            <SignUpForm dict={dict.auth.signup} lang={lang} />
          </div>
        </div>
      </main>
      <Footer lang={lang} />
    </>
  );
}
