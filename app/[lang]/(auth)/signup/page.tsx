import { Sparkles } from 'lucide-react';
import { AuthPageLayout } from '@/components/auth-page-layout';
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
    <AuthPageLayout
      lang={lang}
      banner={
        <div className="mx-auto inline-flex items-center px-4 py-2 rounded-full bg-blue-500/10 dark:bg-blue-600/20 text-blue-400 mb-4">
          <Sparkles className="size-4 mr-2" />
          <span>{dict.landing.cta.freeCredits}</span>
        </div>
      }
    >
      <h1 className="mb-2 text-center text-3xl font-bold">
        {dict.auth.signup.title}
      </h1>
      <p className="mb-8 text-center text-muted-foreground">
        {dict.auth.signup.subtitle}
      </p>
      <SignUpForm dict={dict.auth.signup} lang={lang} />
    </AuthPageLayout>
  );
}
