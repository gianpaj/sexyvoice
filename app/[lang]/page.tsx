import { allPosts } from 'contentlayer/generated';
import {
  ArrowRightIcon,
  CheckCircle2,
  Globe2,
  Mic2,
  Shield,
  Sparkles,
} from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import Script from 'next/script';
import { getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';
import type { Graph } from 'schema-dts';

import { i18n, type Locale } from '@/lib/i18n/i18n-config';
import { Link } from '@/lib/i18n/navigation';

// import { VoiceGenerator } from "@/components/voice-generator";
// import { PopularAudios } from '@/components/popular-audios';

import { FAQComponent } from '@/components/faq';
import Footer from '@/components/footer';
import { HeaderStatic } from '@/components/header-static';
import AnimWaveForm from '@/components/landing-hero';
import PricingTable from '@/components/pricing-table';
import { PromoBanner } from '@/components/promo-banner';
import { SampleAudioPreviews } from '@/components/sample-audio-previews';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: 'website',
    url: 'https://sexyvoice.ai/en',
    images: [
      {
        url: 'https://sexyvoice.ai/sexyvoice.ai-og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'SexyVoice.ai AI voice generator homepage',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['https://sexyvoice.ai/sexyvoice.ai-og-image.jpg'],
  },
  other: {
    preconnect: 'https://files.sexyvoice.ai',
  },
};

type PromoCountdownLabels = NonNullable<
  React.ComponentProps<typeof PromoBanner>['countdown']
>['labels'];

export default async function LandingPage(props: {
  params: Promise<{ lang: Locale }>;
}) {
  const { lang } = await props.params;

  // Validate that the language is a supported locale
  if (!i18n.locales.includes(lang as Locale)) {
    redirect(`/${i18n.defaultLocale}`);
  }

  const messages = (await getMessages({ locale: lang })) as IntlMessages;
  const dictLanding = messages.landing;

  const promoDictKey =
    process.env.NEXT_PUBLIC_PROMO_TRANSLATIONS || 'blackFridayBanner';
  const promoDict = Object.hasOwn(messages.promos, promoDictKey)
    ? messages.promos[promoDictKey as keyof typeof messages.promos]
    : undefined;

  const [firstPart, ...restParts] = dictLanding.hero.title.split(',');
  const titleRestParts = restParts.join(',');
  const promoCountdown =
    process.env.NEXT_PUBLIC_PROMO_COUNTDOWN_END_DATE &&
    promoDict &&
    'countdown' in promoDict
      ? ({
          enabled: true,
          endDate: process.env.NEXT_PUBLIC_PROMO_COUNTDOWN_END_DATE,
          labels: promoDict.countdown as PromoCountdownLabels,
        } satisfies React.ComponentProps<typeof PromoBanner>['countdown'])
      : undefined;

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
      <Script type="application/ld+json">{JSON.stringify(jsonLd)}</Script>

      {promoDict && (
        <PromoBanner
          ariaLabelDismiss={promoDict.ariaLabelDismiss}
          countdown={promoCountdown}
          ctaLink={`/${lang}/signup`}
          ctaText={promoDict.ctaLoggedOut}
          isEnabled={process.env.NEXT_PUBLIC_PROMO_ENABLED === 'true'}
          text={promoDict.text}
        />
      )}
      <HeaderStatic />
      <main id="main-content">
        <div className="min-h-screen bg-linear-to-br from-background to-gray-800">
          <div className="container mx-auto px-4">
            {/* Hero Section */}
            <div className="z-10 space-y-6 py-20 text-center md:pb-32">
              <AnimWaveForm />
              <h1 className="text-balance font-bold text-5xl md:text-6xl">
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

            {/* Trust Section */}
            <section
              aria-labelledby="trust-section-title"
              className="mx-auto max-w-6xl py-10"
            >
              <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/3 px-6 py-8 shadow-[0_20px_80px_rgba(0,0,0,0.28)] backdrop-blur-sm md:px-10 md:py-10">
                <div className="-left-10 absolute top-0 h-32 w-32 rounded-full bg-brand-red/10 blur-3xl" />
                <div className="-right-6 absolute bottom-0 h-36 w-36 rounded-full bg-brand-purple/10 blur-3xl" />
                <div className="relative mb-8 text-center">
                  <p className="mb-3 font-medium text-[11px] uppercase tracking-[0.35em] text-white/45">
                    Instant clarity
                  </p>
                  <h2
                    className="mx-auto max-w-2xl text-balance font-bold text-2xl text-white md:text-3xl"
                    id="trust-section-title"
                  >
                    {dictLanding.trust.title}
                  </h2>
                </div>
                <div className="relative grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {dictLanding.trust.items.map((item, idx) => (
                    <Card
                      className="group overflow-hidden border-white/10 bg-black/20 transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.07]"
                      key={idx}
                    >
                      <CardContent className="flex min-h-32 flex-col gap-4 p-5">
                        <div className="flex items-center gap-3">
                          <div className="flex size-10 items-center justify-center rounded-full border border-brand-red/25 bg-brand-red/10 text-brand-red shadow-[0_0_30px_rgba(239,68,68,0.15)]">
                            <CheckCircle2 aria-hidden className="size-5" />
                          </div>
                          <span className="font-medium text-[11px] uppercase tracking-[0.26em] text-white/35">
                            0{idx + 1}
                          </span>
                        </div>
                        <p className="min-w-0 wrap-break-word text-sm leading-6 text-white/88">
                          {item}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </section>

            {/* Audio Previews Grid */}
            <SampleAudioPreviews
              initialAudios={getSampleAudiosByLanguage(lang)}
              trySamplesSubtitle={dictLanding.popular.trySamplesSubtitle}
              trySamplesTitle={dictLanding.popular.trySamplesTitle}
            />

            {/* How It Works Section */}
            <section
              aria-labelledby="how-it-works-title"
              className="mx-auto max-w-6xl py-18"
            >
              <div className="mb-10 text-center">
                <p className="mb-3 font-medium text-[11px] uppercase tracking-[0.35em] text-white/45">
                  Three-step flow
                </p>
                <h2
                  className="mx-auto max-w-2xl text-balance font-bold text-3xl text-white md:text-4xl"
                  id="how-it-works-title"
                >
                  {dictLanding.howItWorks.title}
                </h2>
              </div>
              <div className="grid gap-6 md:grid-cols-3">
                {dictLanding.howItWorks.steps.map((step, idx) => (
                  <Card
                    className="group relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-linear-to-b from-white/[0.07] to-white/3 shadow-[0_12px_50px_rgba(0,0,0,0.24)] transition-all duration-300 hover:-translate-y-1 hover:border-white/20"
                    key={idx}
                  >
                    <div className="absolute inset-x-6 top-0 h-px bg-linear-to-r from-transparent via-white/25 to-transparent" />
                    <CardHeader className="pb-3 pt-6">
                      <div className="mb-5 flex items-center justify-between">
                        <div className="flex size-14 items-center justify-center rounded-full border border-brand-red/25 bg-brand-red/10 font-bold text-brand-red text-lg tabular-nums shadow-[0_0_40px_rgba(239,68,68,0.16)]">
                          {idx + 1}
                        </div>
                        <span className="font-medium text-[11px] uppercase tracking-[0.3em] text-white/30">
                          Step
                        </span>
                      </div>
                      <h3 className="text-balance text-left font-medium text-pink-200 text-xl leading-8">
                        {step.title}
                      </h3>
                    </CardHeader>
                    <CardContent>
                      <p className="text-left text-sm leading-7 text-white/75">
                        {step.description}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            {/* Use Cases Section */}
            <section
              aria-labelledby="use-cases-title"
              className="mx-auto max-w-6xl py-16"
            >
              <div className="mb-10 text-center">
                <p className="mb-3 font-medium text-[11px] uppercase tracking-[0.35em] text-white/45">
                  Creative fit
                </p>
                <h2
                  className="mx-auto max-w-3xl text-balance font-bold text-3xl text-white md:text-4xl"
                  id="use-cases-title"
                >
                  {dictLanding.useCases.title}
                </h2>
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                {dictLanding.useCases.items.map((item, idx) => (
                  <Card
                    className="group relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-black/20 shadow-[0_12px_50px_rgba(0,0,0,0.22)] transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/5"
                    key={idx}
                  >
                    <div className="absolute inset-y-0 left-0 w-px bg-linear-to-b from-transparent via-white/20 to-transparent" />
                    <CardHeader className="pb-3">
                      <div className="mb-4 flex items-center gap-3">
                        <span className="inline-flex rounded-full border border-white/10 bg-white/6 px-3 py-1 font-medium text-[10px] uppercase tracking-[0.25em] text-white/45">
                          Use case {idx + 1}
                        </span>
                      </div>
                      <CardTitle className="text-balance text-pink-200 text-xl leading-8">
                        {item.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="min-w-0 wrap-break-word text-sm leading-7 text-white/75">
                        {item.description}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

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

            <PricingTable lang={lang} />

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
                          height={100}
                          loading="lazy"
                          priority={false}
                          src={post.image}
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
