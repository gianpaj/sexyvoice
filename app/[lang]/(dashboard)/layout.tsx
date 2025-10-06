import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Locale } from '@/lib/i18n/i18n-config';
import DashboardUI from './dashboard.ui';

export default async function DashboardLayout(props: {
  children: React.ReactNode;
  params: Promise<{ lang: Locale }>;
}) {
  const {lang} = await props.params;

  const dict = await getDictionary(lang);
  const halloweenDict = await getDictionary(lang, 'halloween');

  return (
    <DashboardUI lang={lang} dict={dict.creditsSection} halloweenDict={halloweenDict}>
      {props.children}
    </DashboardUI>
  );
}
