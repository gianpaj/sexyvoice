import { i18n } from '@/lib/i18n/i18n-config';
import { Providers } from '../providers';

export async function generateStaticParams() {
  return i18n.locales.map((locale) => ({ lang: locale }));
}

export default async function LangLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ lang: 'es' | 'de' }>;
}>) {
  return (
    <html lang={(await params).lang}>
      <Providers>{children}</Providers>
    </html>
  );
}
