import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Locale } from '@/lib/i18n/i18n-config';
import { SignUpForm } from './signup-form';
import { Header } from '@/components/header';
import { Sparkles } from 'lucide-react';

export default async function SignUpPage(props: {
  params: Promise<{ lang: Locale }>;
}) {
  const params = await props.params;

  const { lang } = params;

  const dict = await getDictionary(lang);

  return (
    <>
      <Header lang={lang} />
      <div className="flex min-h-screen sm:pt-0 pt-11 sm:items-center flex-col justify-center bg-gradient-to-br from-gray-900 to-gray-800 p-4">
        <div className="inline-flex items-center px-4 py-2 rounded-full bg-blue-600/20 text-blue-400 mb-4">
          <Sparkles className="size-4 mr-2" />
          <span>{dict.landing.cta.freeCredits}</span>
        </div>
        <div className="w-full max-w-md">
          <div className="rounded-2xl bg-white p-8 shadow-xl">
            <h1 className="mb-2 text-center text-3xl font-bold text-gray-900">
              {dict.auth.signup.title}
            </h1>
            <p className="mb-8 text-center text-gray-600">
              {dict.auth.signup.subtitle}
            </p>
            <SignUpForm dict={dict.auth.signup} lang={lang} />
          </div>
        </div>
      </div>
    </>
  );
}
