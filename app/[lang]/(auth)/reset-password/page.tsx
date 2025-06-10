import { AuthPageLayout } from '@/components/auth-page-layout';
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
    <AuthPageLayout
      lang={lang}
      containerClassName="sm:justify-center justify-end"
    >
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
    </AuthPageLayout>
  );
}
