import { i18n } from '@/lib/i18n/i18n-config';
import { Providers } from '../providers';

export async function generateStaticParams() {
  return i18n.locales.map((locale) => ({ lang: locale }));
}

export default async function LangLayout(props: { children: React.ReactNode }) {
  const { children } = props;

  return <Providers>{children}</Providers>;
}
