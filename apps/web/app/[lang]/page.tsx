import { allPosts } from 'contentlayer/generated';
import {
  ArrowRightIcon,
  AudioLines,
  Globe2,
  Mic2,
  PhoneCall,
  Shield,
  Sparkles,
} from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { getMessages, setRequestLocale } from 'next-intl/server';
import type { Graph } from 'schema-dts';

import type { Locale } from '@/lib/i18n/i18n-config';
import { Link } from '@/lib/i18n/navigation';

// import { VoiceGenerator } from "@/components/voice-generator";
// import { PopularAudios } from '@/components/popular-audios';

import { Banner } from '@/components/banner';
import { CardDecorator } from '@/components/card-decorator';
import { FAQComponent } from '@/components/faq';
import Footer from '@/components/footer';
import { HeaderStatic } from '@/components/header-static';
import HeroWaveform from '@/components/hero-waveform';
import { JsonLd } from '@/components/json-ld';
import PricingTable from '@/components/pricing-table';
import { SampleAudioPreviews } from '@/components/sample-audio-previews';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { resolveActiveBanner } from '@/lib/banners/resolve-banner';
import { VOICE_CLONING_PAGE_ENABLED } from '@/lib/features';
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
        '@id': 'https://sexyvoice.ai/#organization',
        '@type': 'Organization',
        logo: 'https://sexyvoice.ai/web-app-manifest-192x192.png',
        name: 'SexyVoice.ai',
        sameAs: [
          'https://x.com/sexyvoiceai',
          'https://instagram.com/sexyvoice_ai',
        ],
        url: 'https://sexyvoice.ai',
      },
      {
        '@id': 'https://sexyvoice.ai/#website',
        '@type': 'WebSite',
        description: messages.pages.description,
        inLanguage: lang,
        name: 'SexyVoice.ai',
        publisher: {
          '@id': 'https://sexyvoice.ai/#organization',
        },
        url: 'https://sexyvoice.ai',
      },
      {
        '@id': `${siteUrl}/#webpage`,
        '@type': 'WebPage',
        about: {
          '@id': 'https://sexyvoice.ai/#organization',
        },
        description: messages.pages.description,
        inLanguage: lang,
        isPartOf: {
          '@id': 'https://sexyvoice.ai/#website',
        },
        name: messages.pages.defaultTitle,
        url: siteUrl,
      },
      {
        '@id': `${siteUrl}/#faq`,
        '@type': 'FAQPage',
        isPartOf: {
          '@id': `${siteUrl}/#webpage`,
        },
        mainEntity: faqQuestions.map((q) => ({
          '@type': 'Question' as const,
          acceptedAnswer: {
            '@type': 'Answer' as const,
            text: q.answer,
          },
          name: q.question,
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
        <div className="relative isolate min-h-screen overflow-x-clip bg-linear-to-br from-[#090711] to-zinc-800 selection:bg-[#d8b4ff]/30">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 left-[-12rem] -z-10 h-[36rem] w-[36rem] scale-75 rounded-full bg-[radial-gradient(circle_at_center,rgba(167,139,250,0.34),rgba(91,33,182,0.12)_42%,transparent_70%)] opacity-50 blur-3xl md:scale-100 md:opacity-100"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-[17rem] right-[-14rem] -z-10 h-[42rem] w-[42rem] scale-75 rounded-full bg-[radial-gradient(circle_at_center,rgba(244,114,182,0.28),rgba(59,130,246,0.08)_48%,transparent_72%)] opacity-50 blur-3xl md:scale-100 md:opacity-100"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-[100svh] left-1/2 -z-10 h-[34rem] w-[56rem] -translate-x-1/2 scale-75 rounded-full bg-[radial-gradient(circle_at_center,rgba(14,165,233,0.16),transparent_68%)] opacity-50 blur-3xl md:scale-100 md:opacity-100"
          />

          <div className="container mx-auto px-4">
            {/* Hero Section */}
            <div className="z-10 flex min-h-[calc(100svh-4rem)] flex-col justify-evenly py-8 text-center">
              <HeroWaveform />
              <h1 className="text-balance font-bold text-5xl leading-14 sm:leading-17 md:text-6xl max-sm:[&:lang(de)]:text-4xl max-sm:[&:lang(de)]:leading-12">
                <span className="text-white/90">{firstPart}</span>
                <br />
                {titleRestParts && (
                  <span
                    className="whitespace-break-spaces bg-linear-to-r bg-clip-text text-transparent"
                    style={{
                      backgroundImage:
                        'linear-gradient(146deg, hsl(var(--brand-purple)) 0%, hsl(var(--brand-red)) 80%)',
                    }}
                  >
                    {titleRestParts}
                  </span>
                )}
              </h1>
              <p className="mx-auto max-w-2xl text-balance text-gray-300 text-xl leading-8 sm:leading-10">
                {dictLanding.hero.subtitle.split('\n').map((line) => (
                  <span className="block" key={line}>
                    {line}
                  </span>
                ))}
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
                  <Link href="/signup">{dictLanding.hero.buttonCTA}</Link>
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
            <div
              className={`mx-auto grid max-w-5xl justify-items-center gap-6 py-16 sm:grid-cols-2 ${
                VOICE_CLONING_PAGE_ENABLED
                  ? 'lg:grid-cols-6 lg:*:col-span-2 lg:*:first:col-start-2'
                  : 'lg:grid-cols-2'
              }`}
            >
              <Link
                className="group max-w-sm rounded-xl"
                href="/voice-call"
                prefetch
              >
                <Card className="h-full border-fuchsia-400/25 bg-white/3 shadow-zinc-950/5 transition-colors group-hover:border-fuchsia-400/60 group-hover:bg-fuchsia-400/8">
                  <CardHeader className="pb-3">
                    <CardDecorator>
                      <PhoneCall
                        aria-hidden
                        className="size-6 text-gray-200 transition-colors group-hover:text-white"
                      />
                    </CardDecorator>

                    <h3 className="mt-6 text-balance text-center font-medium text-pink-200 transition-colors group-hover:text-pink-100">
                      {dictLanding.features.voiceCalling.title}
                    </h3>
                  </CardHeader>

                  <CardContent>
                    <p className="text-pretty text-center text-sm text-zinc-300">
                      {dictLanding.features.voiceCalling.description}
                    </p>
                  </CardContent>
                </Card>
              </Link>
              {VOICE_CLONING_PAGE_ENABLED && (
                <Link
                  className="group max-w-sm rounded-xl"
                  href="/voice-cloning"
                  prefetch
                >
                  <Card className="h-full border-fuchsia-400/25 bg-white/3 shadow-zinc-950/5 transition-colors group-hover:border-fuchsia-400/60 group-hover:bg-fuchsia-400/8">
                    <CardHeader className="pb-3">
                      <CardDecorator>
                        <AudioLines
                          aria-hidden
                          className="size-6 text-gray-200 transition-colors group-hover:text-white"
                        />
                      </CardDecorator>

                      <h3 className="mt-6 text-balance text-center font-medium text-pink-200 transition-colors group-hover:text-pink-100">
                        {dictLanding.features.voiceCloneDemo.title}
                      </h3>
                    </CardHeader>

                    <CardContent>
                      <p className="text-pretty text-center text-sm text-zinc-300">
                        {dictLanding.features.voiceCloneDemo.description}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              )}
              <Card className="group max-w-sm border-white/10 bg-white/3 shadow-zinc-950/5">
                <CardHeader className="pb-3">
                  <CardDecorator>
                    <Shield aria-hidden className="size-6 text-gray-200" />
                  </CardDecorator>

                  <h3 className="mt-6 text-balance text-center font-medium text-pink-200">
                    {dictLanding.features.security.title}
                  </h3>
                </CardHeader>
                <CardContent>
                  <p className="text-pretty text-center text-sm text-zinc-300">
                    {dictLanding.features.security.description}
                  </p>
                </CardContent>
              </Card>
              <Card className="group max-w-sm border-white/10 bg-white/3 shadow-zinc-950/5">
                <CardHeader className="pb-3">
                  <CardDecorator>
                    <Mic2 aria-hidden className="size-6 text-gray-200" />
                  </CardDecorator>

                  <h3 className="mt-6 text-balance text-center font-medium text-pink-200">
                    {dictLanding.features.voiceCloning.title}
                  </h3>
                </CardHeader>

                <CardContent>
                  <p className="text-pretty text-center text-sm text-zinc-300">
                    {dictLanding.features.voiceCloning.description}
                  </p>
                </CardContent>
              </Card>

              <Card className="group max-w-sm border-white/10 bg-white/3 shadow-zinc-950/5">
                <CardHeader className="pb-3">
                  <CardDecorator>
                    <Globe2 aria-hidden className="size-6 text-gray-200" />
                  </CardDecorator>

                  <h3 className="mt-6 text-balance text-center font-medium text-pink-200">
                    {dictLanding.features.multiLanguage.title}
                  </h3>
                </CardHeader>

                <CardContent>
                  <p className="text-pretty text-center text-sm text-zinc-300">
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
              <h2 className="mb-4 text-balance font-bold text-2xl">
                {dictLanding.latestPosts}
              </h2>
              {get3PostsByLang(lang).map((post) => (
                <Card
                  className="relative max-w-sm pt-0 lg:min-w-[400px] lg:max-w-[400px]"
                  key={post.url}
                >
                  {post.image && (
                    <Link href={post.url} prefetch>
                      <Image
                        alt={post.title}
                        className="relative w-full rounded-t-xl outline outline-white/10 -outline-offset-1"
                        height={200}
                        loading="lazy"
                        priority={false}
                        src={post.image}
                        width={300}
                      />
                    </Link>
                  )}
                  <CardHeader>
                    <CardTitle className="text-balance text-center text-gray-200 text-lg leading-8">
                      <Link href={post.url}>{post.title}</Link>
                    </CardTitle>
                  </CardHeader>
                </Card>
              ))}
              <Link
                className="text-center text-gray-400 text-sm transition-colors hover:text-foreground"
                href="/blog"
              >
                {dictLanding.more}
              </Link>
            </div>

            {/* CTA Section */}
            <div className="space-y-8 py-16 text-center">
              <div className="mb-4 inline-flex items-center rounded-full bg-blue-600/20 px-4 py-2 text-blue-400">
                <Sparkles className="mr-2 size-4" />
                <span>{dictLanding.cta.freeCredits}</span>
              </div>
              <h2 className="text-balance font-bold text-3xl text-white md:text-4xl">
                {dictLanding.cta.title}
              </h2>
              <p className="mx-auto max-w-2xl text-pretty text-gray-300 text-xl">
                {dictLanding.cta.subtitle}
              </p>
              <Button
                asChild
                className="hit-area-4 mt-4 bg-blue-600 hover:bg-blue-700"
                effect="ringHover"
                size="lg"
              >
                <Link href="/signup">{dictLanding.cta.action}</Link>
              </Button>
            </div>
          </div>
        </div>
      </main>
      <Footer lang={lang} />
    </>
  );
}
