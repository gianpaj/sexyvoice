import { Header } from '@/components/header';
import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Locale } from '@/lib/i18n/i18n-config';
import { LoginForm } from './login-form';

export default async function LoginPage(props: {
  params: Promise<{ lang: Locale }>;
}) {
  const params = await props.params;

  const { lang } = params;

  const dict = await getDictionary(lang);

  return (
    <>
      <Header lang={lang} />
      <div className="flex min-h-[calc(100vh-65px)] sm:min-h-screen sm:pt-0 pt-11 sm:items-center flex-col justify-center dark:bg-gradient-to-br dark:from-gray-900 dark:to-gray-800 p-4">
        <div className="w-full max-w-md">
          <div className="rounded-2xl p-8 bg-background shadow-xl">
            <h1 className="mb-2 text-center text-3xl font-bold">
              {dict.auth.login.title}
            </h1>
            <p className="mb-8 text-center text-muted-foreground">
              {dict.auth.login.subtitle}
            </p>
            <LoginForm dict={dict.auth.login} lang={lang} />
          </div>
        </div>
      </div>
    </>
  );
}
