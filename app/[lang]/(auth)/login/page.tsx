import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Locale } from '@/lib/i18n/i18n-config';
import { LoginForm } from './login-form';

export default async function LoginPage({
  params: { lang },
}: {
  params: { lang: Locale };
}) {
  const dict = await getDictionary(lang);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800 p-4">
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
  );
}
