import { Header } from '@/components/header';
import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Locale } from '@/lib/i18n/i18n-config';
import { type Message, ResetPasswordForm } from './reset-password-form';

export default async function ResetPasswordPage(props: {
  params: Promise<{ lang: Locale }>;
  searchParams: Promise<Message>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;

  const { lang } = params;
  const dict = await getDictionary(lang);

  return (
    <>
      <Header lang={lang} />
      <div className="flex min-h-[calc(100vh-65px)] sm:min-h-screen sm:pt-0 pt-11 sm:items-center flex-col sm:justify-center justify-end dark:bg-gradient-to-br dark:from-gray-900 dark:to-gray-800 p-4">
        <div className="w-full max-w-md">
          <div className="rounded-2xl p-8 bg-background shadow-xl">
            <h1 className="mb-2 text-center text-3xl font-bold">
              {dict.auth.resetPassword.title}
            </h1>
            <p className="text-sm text-muted-foreground mb-8">
              {dict.auth.resetPassword.subtitle}
            </p>
            <ResetPasswordForm
              dict={dict.auth.resetPassword}
              lang={lang}
              message={searchParams}
            />
          </div>
        </div>
      </div>
    </>
  );
}
