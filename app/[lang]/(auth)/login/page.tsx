import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Locale } from '@/lib/i18n/i18n-config';
import { LoginForm } from './login-form';
import { Header } from '@/components/header';

export default async function LoginPage(
  props: {
    params: Promise<{ lang: Locale }>;
  }
) {
  const params = await props.params;

  const {
    lang
  } = params;

  const dict = await getDictionary(lang);

  return (
    <>
      <Header lang={lang} />
      <div className="flex min-h-screen sm:pt-0 pt-11 sm:items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800 p-4">
        <div className="w-full max-w-md">
          <div className="rounded-2xl bg-white p-8 shadow-xl">
            <h1 className="mb-2 text-center text-3xl font-bold text-gray-900">
              {dict.auth.login.title}
            </h1>
            <p className="mb-8 text-center text-gray-600">
              {dict.auth.login.subtitle}
            </p>
            <LoginForm dict={dict.auth.login} lang={lang} />
          </div>
        </div>
      </div>
    </>
  );
}
