import { allPosts } from 'contentlayer/generated';
import { ArrowRightIcon, Globe2, Mic2, Shield, Sparkles } from 'lucide-react';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { getMessages, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import type { Graph } from 'schema-dts';

import type { Locale } from '@/lib/i18n/i18n-config';
import { Link } from '@/lib/i18n/navigation';

// import { VoiceGenerator } from "@/components/voice-generator";
// import { PopularAudios } from '@/components/popular-audios';

import { Banner } from '@/components/banner';
import { FAQComponent } from '@/components/faq';
import Footer from '@/components/footer';
import { HeaderStatic } from '@/components/header-static';
import { JsonLd } from '@/components/json-ld';
import LandingHero from '@/components/landing-hero';
import PricingTable from '@/components/pricing-table';
import { SampleAudioPreviews } from '@/components/sample-audio-previews';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { resolveActiveBanner } from '@/lib/banners/resolve-banner';
import { routing } from '@/src/i18n/routing';
import { getSampleAudiosByLanguage } from '../sample-audio';

const get3PostsByLang = (lang: Locale) =>
  allPosts
    .filter((post) => post.locale === lang && post.image && !post.draft)
    ?.sort(
      (postA, postB) =>
        new Date(postB.date).getTime() - new Date(postA.date).getTime(),
    )
    .slice(0, 3);

export const metadata: Metadata = {
  other: {
    preconnect: 'https://files.sexyvoice.ai',
  },
};

export default async function LandingPage(props: {
  params: Promise<{ lang: Locale }>;
}) {
  const { lang } = await props.params;

  // Validate that the language is a supported locale
  if (!routing.locales.includes(lang as Locale)) {
    redirect(`/${routing.defaultLocale}`);
  }

  // Enable static rendering
  setRequestLocale(lang);

  const messages = (await getMessages({ locale: lang })) as IntlMessages;
  const dictLanding = messages.landing;
  const cookieStore = await cookies();
  const dismissedCookieKeys = cookieStore
    .getAll()
    .filter((cookie) => cookie.value)
    .map((cookie) => cookie.name);
  const activeBanner = resolveActiveBanner({
    audience: 'loggedOut',
    dismissedCookieKeys,
    lang,
    messages,
    placement: 'landing',
  });

  const [firstPart, ...restParts] = dictLanding.hero.title.split(',');
  const titleRestParts = restParts.join(',');

  const faqQuestions = dictLanding.faq.groups.flatMap(
    (group) => group.questions,
  );

  const siteUrl = `https://sexyvoice.ai/${lang}`;

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
          'https://x.com/sexyvoice_ai',
          'https://instagram.com/sexyvoice.ai',
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
        name: messages.pages.defaultTitle,
        description: messages.pages.description,
        isPartOf: {
          '@id': 'https://sexyvoice.ai/#website',
        },
        about: {
          '@id': 'https://sexyvoice.ai/#organization',
        },
        inLanguage: lang,
      },
      {
        '@type': 'FAQPage',
        '@id': `${siteUrl}/#faq`,
        isPartOf: {
          '@id': `${siteUrl}/#webpage`,
        },
        mainEntity: faqQuestions.map((q) => ({
          '@type': 'Question' as const,
          name: q.question,
          acceptedAnswer: {
            '@type': 'Answer' as const,
            text: q.answer,
          },
        })),
      },
    ],
  };

  return (
    <>
      <JsonLd data={jsonLd} />

      {activeBanner && <Banner banner={activeBanner} />}
      <HeaderStatic />
      <main id="main-content">
        <div className="min-h-screen bg-linear-to-br from-background to-gray-800">
          <div className="container mx-auto px-4">
            {/* Hero Section */}
            <div className="z-10 space-y-6 py-20 text-center md:pb-32">
              <LandingHero />
              <h1 className="font-bold text-5xl md:text-6xl">
                <span className="text-white/90 leading-14">{firstPart}</span>
                <br />
                {titleRestParts && (
                  <span
                    className="whitespace-break-spaces bg-linear-to-r bg-clip-text text-transparent leading-16"
                    style={{
                      backgroundImage:
                        'linear-gradient(146deg, hsl(var(--brand-purple)) 0%, hsl(var(--brand-red)) 80%)',
                    }}
                  >
                    {titleRestParts}
                  </span>
                )}
              </h1>
              <p className="mx-auto max-w-2xl whitespace-break-spaces py-12 text-gray-300 text-xl leading-10">
                {dictLanding.hero.subtitle}
              </p>

              <div className="mx-auto flex w-fit flex-col gap-2">
                <Button
                  asChild
                  className="hit-area-4 w-fit self-center"
                  effect="expandIcon"
                  icon={ArrowRightIcon}
                  iconPlacement="right"
                  size="lg"
                >
                  <Link href={`/${lang}/signup`}>
                    {dictLanding.hero.buttonCTA}
                  </Link>
                </Button>
                <p className="text-gray-300 text-xs">
                  {dictLanding.hero.noCreditCard}
                </p>
              </div>
            </div>

            {/* Audio Previews Grid */}
            <SampleAudioPreviews
              initialAudios={getSampleAudiosByLanguage(lang)}
              trySamplesSubtitle={dictLanding.popular.trySamplesSubtitle}
              trySamplesTitle={dictLanding.popular.trySamplesTitle}
            />

            {/* Voice Generator Section */}
            {/* <div className="max-w-2xl mx-auto bg-white/10 backdrop-blur-sm rounded-xl p-8 mb-16">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white mb-2">
                {dict.generator.title}
              </h2>
              <p className="text-gray-300">{dict.generator.subtitle}</p>
            </div>
            <VoiceGenerator
              dict={dict.generator}
              download={dict.generator.download}
            />
          </div> */}

            {/* Popular Audios Section */}
            {/* <div className="max-w-4xl mx-auto mb-16">
            <h2 className="text-2xl font-bold text-white mb-2">
              {dict.popular.title}
            </h2>
            <p className="text-gray-300 mb-6">
              {dict.popular.subtitle}
            </p>
            <PopularAudios dict={dict.popular} />
          </div> */}

            {/* Features Grid */}
            <div className="grid gap-6 py-16 md:grid-cols-2 lg:grid-cols-3 xl:px-28">
              <Card className="group shadow-zinc-950/5">
                <CardHeader className="pb-3">
                  <CardDecorator>
                    <Shield aria-hidden className="size-6 text-gray-200" />
                  </CardDecorator>

                  <h3 className="mt-6 text-center font-medium text-pink-200">
                    {dictLanding.features.security.title}
                  </h3>
                </CardHeader>
                <CardContent>
                  <p className="text-justify text-sm">
                    {dictLanding.features.security.description}
                  </p>
                </CardContent>
              </Card>
              <Card className="group shadow-zinc-950/5">
                <CardHeader className="pb-3">
                  <CardDecorator>
                    <Mic2 aria-hidden className="size-6 text-gray-200" />
                  </CardDecorator>

                  <h3 className="mt-6 text-center font-medium text-pink-200">
                    {dictLanding.features.voiceCloning.title}
                  </h3>
                </CardHeader>

                <CardContent>
                  <p className="text-justify text-sm">
                    {dictLanding.features.voiceCloning.description}
                  </p>
                </CardContent>
              </Card>

              <Card className="group shadow-zinc-950/5">
                <CardHeader className="pb-3">
                  <CardDecorator>
                    <Globe2 aria-hidden className="size-6 text-gray-200" />
                  </CardDecorator>

                  <h3 className="mt-6 text-center font-medium text-pink-200">
                    {dictLanding.features.multiLanguage.title}
                  </h3>
                </CardHeader>

                <CardContent>
                  <p className="text-justify text-sm">
                    {dictLanding.features.multiLanguage.description}
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-col">
              <h2 className="mx-auto mb-4 text-pretty font-semibold text-2xl">
                {messages.credits.pricingPlan}
              </h2>
              <PricingTable className="py-4 pb-16" lang={lang} />
            </div>

            {/* FAQ Section */}
            <div className="mx-auto max-w-3xl py-16">
              <FAQComponent lang={lang} />
            </div>

            {/* Blog posts Section */}
            <div className="mx-auto grid grid-cols-1 gap-4 md:grid-cols-1 lg:max-w-[400px] lg:grid-cols-1">
              <h2 className="mb-4 font-bold text-2xl">
                {dictLanding.latestPosts}
              </h2>
              {get3PostsByLang(lang).map((post, idx) => (
                <Card
                  className="mx-auto lg:min-w-[400px] lg:max-w-[400px]"
                  key={idx}
                >
                  <Link href={post.url} prefetch>
                    <CardHeader>
                      {post.image && (
                        <Image
                          alt={post.title}
                          className="mx-auto rounded-lg"
                          height={200}
                          loading="lazy"
                          priority={false}
                          src={post.image}
                          style={{ width: '100%', height: 'auto' }}
                          width={300}
                        />
                      )}
                      <CardTitle className="text-center text-gray-200 text-lg leading-8">
                        {post.title}
                      </CardTitle>
                    </CardHeader>
                  </Link>
                </Card>
              ))}
              <Link className="text-center hover:underline" href="/blog">
                {dictLanding.more}
              </Link>
            </div>

            {/* CTA Section */}
            <div className="space-y-8 py-16 text-center">
              <div className="mb-4 inline-flex items-center rounded-full bg-blue-600/20 px-4 py-2 text-blue-400">
                <Sparkles className="mr-2 size-4" />
                <span>{dictLanding.cta.freeCredits}</span>
              </div>
              <h2 className="font-bold text-3xl text-white md:text-4xl">
                {dictLanding.cta.title}
              </h2>
              <p className="mx-auto max-w-2xl text-gray-300 text-xl">
                {dictLanding.cta.subtitle}
              </p>
              <Button
                asChild
                className="hit-area-4 mt-4 bg-blue-600 hover:bg-blue-700"
                effect="ringHover"
                size="lg"
              >
                <Link href={`/${lang}/signup`}>{dictLanding.cta.action}</Link>
              </Button>
            </div>
          </div>
        </div>
      </main>
      <Footer lang={lang} />
    </>
  );
}

const CardDecorator = ({ children }: { children: ReactNode }) => (
  <div className="relative mx-auto size-36">
    <div className="absolute inset-0 m-auto flex size-12 items-center justify-center rounded-sm border-t border-l bg-brand-red/65">
      {children}
    </div>
  </div>
);
