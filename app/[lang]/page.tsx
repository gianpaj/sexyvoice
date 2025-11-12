import { allPosts } from 'contentlayer/generated';
import { ArrowRightIcon, Globe2, Mic2, Shield, Sparkles } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import Script from 'next/script';
import type { ReactNode } from 'react';
import type { FAQPage, WithContext } from 'schema-dts';

import { getDictionary } from '@/lib/i18n/get-dictionary';
import { i18n, type Locale } from '@/lib/i18n/i18n-config';

// import { VoiceGenerator } from "@/components/voice-generator";
// import { PopularAudios } from '@/components/popular-audios';

import { AudioPreviewCard } from '@/components/audio-preview-card';
import Footer from '@/components/footer';
import { HeaderStatic } from '@/components/header-static';
import LandingHero from '@/components/landing-hero';
import PricingTable from '@/components/pricing-table';
import { PromoBanner } from '@/components/promo-banner';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getSampleAudiosByLang } from '../sample-audio';

const get3PostsByLang = (lang: Locale) =>
  allPosts.filter((post) => post.locale === lang)?.slice(0, 3);

export const metadata: Metadata = {
  other: {
    preconnect: 'https://files.sexyvoice.ai',
  },
};

export default async function LandingPage(props: {
  params: Promise<{ lang: Locale }>;
}) {
  const params = await props.params;

  const { lang } = params;

  // Validate that the language is a supported locale
  if (!i18n.locales.includes(lang as Locale)) {
    redirect(`/${i18n.defaultLocale}`);
  }

  const dict = await getDictionary(lang, 'landing');
  const halloweenDict = (await getDictionary(lang, 'promos')).halloweenBanner;

  const [firstPart, ...restParts] = dict.hero.title.split(',');
  const titleRestParts = restParts.join(',');

  const jsonLd: WithContext<FAQPage> = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: dict.faq.questions.map((q) => ({
      '@type': 'Question',
      name: q.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: q.answer,
      },
    })),
  };

  return (
    <>
      <Script type="application/ld+json">{JSON.stringify(jsonLd)}</Script>

      <PromoBanner
        text={halloweenDict.text}
        ctaText={halloweenDict.ctaLoggedOut}
        arialLabelDismiss={halloweenDict.arialLabelDismiss}
        ctaLink={`/${lang}/signup`}
        isEnabled={process.env.NEXT_PUBLIC_PROMO_ENABLED === 'true'}
      />
      <HeaderStatic lang={lang} />
      <main id="main-content">
        <div className="disable-bg-firefox min-h-screen dark:bg-gradient-to-br dark:from-gray-900 dark:to-gray-800">
          <div className="container mx-auto px-4">
            {/* Hero Section */}
            <div className="z-10 space-y-6 py-20 text-center md:pb-32">
              <LandingHero />
              <h1 className="font-bold text-5xl text-white leading-10 md:text-6xl">
                <span className="leading-[3.5rem]">{firstPart}</span>
                {titleRestParts && (
                  <span className="text-orange-300">{titleRestParts}</span>
                )}
              </h1>
              <p className="mx-auto max-w-2xl whitespace-break-spaces py-12 text-gray-300 text-xl">
                {dict.hero.subtitle}
              </p>
              <div className="mx-auto flex w-fit flex-col gap-2">
                <Button
                  asChild
                  size="lg"
                  effect="expandIcon"
                  icon={ArrowRightIcon}
                  iconPlacement="right"
                >
                  <Link href={`/${lang}/signup`}>{dict.hero.buttonCTA}</Link>
                </Button>
                <p className="text-gray-300 text-xs">
                  {dict.hero.noCreditCard}
                </p>
              </div>
            </div>

            {/* Audio Previews Grid */}
            <div className="mx-auto mb-16 max-w-4xl md:pb-16">
              <h2 className="mb-2 font-bold text-2xl text-white">
                {dict.popular.trySamplesTitle}
              </h2>
              <p className="mb-6 text-gray-200">
                {dict.popular.trySamplesSubtitle}
              </p>
              <div className="grid gap-6 md:grid-cols-2">
                {getSampleAudiosByLang(lang).map((audio) => (
                  <AudioPreviewCard
                    key={audio.id}
                    name={audio.name}
                    prompt={audio.prompt}
                    audioSrc={`https://files.sexyvoice.ai/${audio.audioSrc}`}
                  />
                ))}
              </div>
            </div>

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
                    <Mic2 className="size-6 text-blue-400" aria-hidden />
                  </CardDecorator>

                  <h3 className="mt-6 text-center font-medium">
                    {dict.features.voiceCloning.title}
                  </h3>
                </CardHeader>

                <CardContent>
                  <p className="text-sm">
                    {dict.features.voiceCloning.description}
                  </p>
                </CardContent>
              </Card>

              <Card className="group shadow-zinc-950/5">
                <CardHeader className="pb-3">
                  <CardDecorator>
                    <Globe2 className="size-6 text-blue-400" aria-hidden />
                  </CardDecorator>

                  <h3 className="mt-6 text-center font-medium">
                    {dict.features.multiLanguage.title}
                  </h3>
                </CardHeader>

                <CardContent>
                  <p className="text-sm">
                    {dict.features.multiLanguage.description}
                  </p>
                </CardContent>
              </Card>
              <Card className="group shadow-zinc-950/5">
                <CardHeader className="pb-3">
                  <CardDecorator>
                    <Shield className="size-6 text-blue-400" aria-hidden />
                  </CardDecorator>

                  <h3 className="mt-6 text-center font-medium">
                    {dict.features.security.title}
                  </h3>
                </CardHeader>

                <CardContent>
                  <p className="text-sm">
                    {dict.features.security.description}
                  </p>
                </CardContent>
              </Card>
            </div>

            <PricingTable lang={lang} />

            {/* FAQ Section */}
            <div className="mx-auto max-w-3xl py-16">
              <div className="mb-12 text-left md:text-center">
                <h2 className="mb-2 font-bold text-3xl text-white">
                  {dict.faq.title}
                </h2>
                <p className="text-gray-200">{dict.faq.subtitle}</p>
              </div>

              <Accordion type="single" collapsible className="w-full">
                {dict.faq.questions.map((faq, index) => (
                  <AccordionItem
                    key={`item-${index}`}
                    value={`item-${index}`}
                    className="border-white/10 border-b"
                  >
                    <AccordionTrigger className="py-5 text-left text-white hover:text-blue-400 hover:no-underline">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="whitespace-break-spaces text-gray-200">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>

            {/* Blog posts Section */}
            <div className="mx-auto grid grid-cols-1 gap-4 md:grid-cols-1 lg:max-w-[400px] lg:grid-cols-1">
              <h2 className="mb-4 font-bold text-2xl">{dict.latestPosts}</h2>
              {get3PostsByLang(lang).map((post, idx) => (
                <Card
                  className="mx-auto lg:min-w-[400px] lg:max-w-[400px]"
                  key={idx}
                >
                  <Link href={`/${post.locale}${post.url}`} prefetch>
                    <CardHeader>
                      {post.image && (
                        <Image
                          src={post.image}
                          alt={post.title}
                          width={300}
                          height={100}
                          priority={false}
                          loading="lazy"
                          className="mx-auto rounded-lg"
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
            <div className="space-y-6 py-16 text-center">
              <div className="mb-4 inline-flex items-center rounded-full bg-blue-600/20 px-4 py-2 text-blue-400">
                <Sparkles className="mr-2 size-4" />
                <span>{dict.cta.freeCredits}</span>
              </div>
              <h2 className="font-bold text-3xl text-white md:text-4xl">
                {dict.cta.title}
              </h2>
              <p className="mx-auto max-w-2xl text-gray-300 text-xl">
                {dict.cta.subtitle}
              </p>
              <Button
                size="lg"
                className="mt-4 bg-blue-600 hover:bg-blue-700"
                asChild
                effect="ringHover"
              >
                <Link href={`/${lang}/signup`}>{dict.cta.action}</Link>
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
  <div className="relative mx-auto size-36 duration-200 [--color-border:color-mix(in_oklab,var(--color-zinc-950)10%,transparent)] dark:group-hover:bg-white/5 group-hover:[--color-border:color-mix(in_oklab,var(--color-zinc-950)20%,transparent)] dark:[--color-border:color-mix(in_oklab,var(--color-white)15%,transparent)] dark:group-hover:[--color-border:color-mix(in_oklab,var(--color-white)20%,transparent)]">
    <div
      aria-hidden
      className="absolute inset-0 bg-[size:24px_24px] bg-grid-gradient"
    />
    <div
      aria-hidden
      className="absolute inset-0 bg-radial from-transparent to-75% to-card"
    />
    <div className="absolute inset-0 m-auto flex size-12 items-center justify-center border-t border-l bg-card">
      {children}
    </div>
  </div>
);
