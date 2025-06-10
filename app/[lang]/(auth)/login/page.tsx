import { AuthPageLayout } from '@/components/auth-page-layout';
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
    <AuthPageLayout lang={lang}>
      <h1 className="mb-2 text-center text-3xl font-bold">
        {dict.auth.login.title}
      </h1>
      <p className="mb-8 text-center text-muted-foreground">
        {dict.auth.login.subtitle}
      </p>
      <LoginForm dict={dict.auth.login} lang={lang} />
    </AuthPageLayout>
  );
}
