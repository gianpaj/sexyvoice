import { Header } from '@/components/header';
import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Locale } from '@/lib/i18n/i18n-config';
import type { Message } from '../../reset-password/reset-password-form';
import { UpdatePasswordForm } from './update-password-form';

export default async function UpdatePasswordPage(props: {
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
      <div className="flex min-h-[calc(100vh-65px)] flex-col justify-end p-4 pt-11 sm:min-h-screen sm:items-center sm:justify-center sm:pt-0 dark:bg-gradient-to-br dark:from-gray-900 dark:to-gray-800">
        <div className="w-full max-w-md">
          <div className="rounded-2xl bg-background p-8 shadow-xl">
            <h1 className="mb-2 text-center font-bold text-3xl">
              {dict.auth.updatePassword.title}
            </h1>
            <p className="mb-8 text-muted-foreground text-sm">
              {dict.auth.updatePassword.subtitle}
            </p>
            <UpdatePasswordForm
              dict={dict.auth.updatePassword}
              lang={lang}
              message={searchParams}
            />
          </div>
        </div>
      </div>
    </>
  );
}
