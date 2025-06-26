import Footer from '@/components/footer';
import { Header } from '@/components/header';
import { ExploreAudios } from '@/components/explore-audios';
import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Locale } from '@/lib/i18n/i18n-config';

export default async function ExplorePage(props: { params: Promise<{ lang: Locale }> }) {
  const { lang } = await props.params;
  const dict = await getDictionary(lang);
  return (
    <>
      <Header lang={lang} />
      <div className="container mx-auto py-8 space-y-6">
        <h1 className="text-3xl font-bold text-white">{dict.explore.title}</h1>
        <ExploreAudios dict={dict.explore} />
      </div>
      <Footer />
    </>
  );
}
