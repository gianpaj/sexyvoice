import { Sparkles } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from 'next-intl/server';
import type { Graph } from 'schema-dts';

import { Banner } from '@/components/banner';
import { DemoCloneSection } from '@/components/demo-clone/demo-clone-section';
import { FAQComponent } from '@/components/faq';
import Footer from '@/components/footer';
import { HeaderStatic } from '@/components/header-static';
import HeroWaveform from '@/components/hero-waveform';
import { JsonLd } from '@/components/json-ld';
import { Button } from '@/components/ui/button';
import { resolveActiveBanner } from '@/lib/banners/resolve-banner';
import type { Locale } from '@/lib/i18n/i18n-config';
import { Link } from '@/lib/i18n/navigation';
import { routing } from '@/src/i18n/routing';

interface Props {
  params: Promise<{ lang: Locale }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const tPages = await getTranslations({ locale: lang, namespace: 'pages' });
  const tHero = await getTranslations({
    locale: lang,
    namespace: 'landing.voiceCloning.hero',
  });

  const title = tPages('titleVoiceCloning') || tHero('title');
  const description = tPages('descriptionVoiceCloning') || tHero('subtitle');
  const url = `https://sexyvoice.ai/${lang}/voice-cloning`;

  return {
    title,
    description,
    other: {
      preconnect: 'https://files.sexyvoice.ai',
    },
    openGraph: {
      title: `${title} | SexyVoice.ai`,
      description,
      url,
      siteName: 'SexyVoice.ai',
      type: 'website',
      locale: lang,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | SexyVoice.ai`,
      description,
    },
    alternates: {
      canonical: url,
      languages: Object.fromEntries(
        routing.locales.map((locale) => [
          locale,
          `https://sexyvoice.ai/${locale}/voice-cloning`,
        ]),
      ),
    },
  };
}

export default async function VoiceCloningPage(props: Props) {
  const { lang } = await props.params;

  // Validate that the language is a supported locale
  if (!routing.locales.includes(lang as Locale)) {
    redirect(`/${routing.defaultLocale}`);
  }

  // Enable static rendering
  setRequestLocale(lang);

  const messages = (await getMessages({ locale: lang })) as IntlMessages;
  const dictLanding = messages.landing;
  // NOTE: intentionally do NOT read cookies() here. Doing so opts this page into
  // dynamic rendering (`cache-control: private, no-store`), which both prevents
  // CDN caching and disqualifies the page from the back/forward cache (bfcache).
  // The <Banner> client component already re-reads the dismissal cookies on the
  // client (it starts hidden and only reveals itself when no dismiss cookie is
  // set), so server-side filtering here is redundant.
  const activeBanner = resolveActiveBanner({
    audience: 'loggedOut',
    lang,
    messages,
    placement: 'landing',
  });

  // Translations are not guaranteed to contain a comma; when they do not, the
  // whole title renders without the gradient span rather than losing text.
  const heroTitle = dictLanding.voiceCloning.hero.title;
  const commaIndex = heroTitle.indexOf(',');
  const firstPart =
    commaIndex === -1 ? heroTitle : heroTitle.slice(0, commaIndex);
  const titleRestParts =
    commaIndex === -1 ? '' : heroTitle.slice(commaIndex + 1);

  const siteUrl = `https://sexyvoice.ai/${lang}/voice-cloning`;

  const jsonLd: Graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://sexyvoice.ai/#organization',
        name: 'SexyVoice.ai',
        url: 'https://sexyvoice.ai',
        logo: 'https://sexyvoice.ai/icon-192x192.png',
        sameAs: [
          'https://x.com/sexyvoiceai',
          'https://instagram.com/sexyvoice_ai',
        ],
      },
      {
        '@type': 'WebSite',
        '@id': 'https://sexyvoice.ai/#website',
        url: 'https://sexyvoice.ai',
        name: 'SexyVoice.ai',
        description: messages.pages.description,
        publisher: {
          '@id': 'https://sexyvoice.ai/#organization',
        },
        inLanguage: lang,
      },
      {
        '@type': 'WebPage',
        '@id': `${siteUrl}/#webpage`,
        url: siteUrl,
        name: messages.pages.titleVoiceCloning || heroTitle,
        description:
          messages.pages.descriptionVoiceCloning ||
          dictLanding.voiceCloning.hero.subtitle,
        isPartOf: {
          '@id': 'https://sexyvoice.ai/#website',
        },
        about: {
          '@id': 'https://sexyvoice.ai/#organization',
        },
        inLanguage: lang,
      },
    ],
  };

  return (
    <>
      <JsonLd data={jsonLd} />

      {activeBanner && <Banner banner={activeBanner} />}
      <HeaderStatic />
      <main id="main-content">
        <div className="min-h-screen bg-linear-to-br from-background to-zinc-800">
          <div className="container mx-auto px-4">
            {/* Hero Section */}
            <div className="z-10 space-y-6 py-20 text-center md:pb-32">
              <HeroWaveform />
              <h1 className="text-balance font-bold text-5xl leading-14 md:text-6xl">
                <span className="text-white/90">{firstPart}</span>
                {titleRestParts && (
                  <>
                    <br />
                    <span
                      className="whitespace-break-spaces bg-linear-to-r bg-clip-text text-transparent"
                      style={{
                        backgroundImage:
                          'linear-gradient(146deg, hsl(var(--brand-purple)) 0%, hsl(var(--brand-red)) 80%)',
                      }}
                    >
                      {titleRestParts}
                    </span>
                  </>
                )}
              </h1>
              <p className="mx-auto max-w-2xl whitespace-break-spaces text-pretty py-12 text-gray-300 text-xl leading-8 sm:leading-10">
                {dictLanding.voiceCloning.hero.subtitle}
              </p>

              <DemoCloneSection lang={lang} />
            </div>

            {/* FAQ Section */}
            <div className="mx-auto max-w-3xl py-16">
              <FAQComponent lang={lang} priorityGroupId="voiceCloning" />
            </div>

            {/* CTA Section */}
            <div className="space-y-8 py-16 text-center">
              <div className="mb-4 inline-flex items-center rounded-full bg-blue-600/20 px-4 py-2 text-blue-400">
                <Sparkles className="mr-2 size-4" />
                <span>{dictLanding.voiceCloning.cta.freeCredits}</span>
              </div>
              <h2 className="text-balance font-bold text-3xl text-white md:text-4xl">
                {dictLanding.voiceCloning.cta.title}
              </h2>
              <p className="mx-auto max-w-2xl text-pretty text-gray-300 text-xl">
                {dictLanding.voiceCloning.cta.subtitle}
              </p>
              <Button
                asChild
                className="hit-area-4 mt-4 bg-blue-600 hover:bg-blue-700"
                effect="ringHover"
                size="lg"
              >
                <Link href="/signup">
                  {dictLanding.voiceCloning.cta.action}
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </main>
      <Footer lang={lang} />
    </>
  );
}
