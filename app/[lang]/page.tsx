import { allPosts } from 'contentlayer/generated';
import { ArrowRightIcon, Globe2, Mic2, Shield, Sparkles } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import Script from 'next/script';
import type { ReactNode } from 'react';
import { Suspense } from 'react';
import type { FAQPage, WithContext } from 'schema-dts';

import { getDictionary } from '@/lib/i18n/get-dictionary';
import { i18n, type Locale } from '@/lib/i18n/i18n-config';

// import { VoiceGenerator } from "@/components/voice-generator";
// import { PopularAudios } from '@/components/popular-audios';

import { AudioPreviewCard } from '@/components/audio-preview-card';
import Footer from '@/components/footer';
import { Header } from '@/components/header';
import LandingHero from '@/components/landing-hero';
import PricingTable from '@/components/pricing-table';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Sample audio preview data
const sampleAudios = [
  // {
  //   id: 1,
  //   name: 'Tara',
  //   prompt:
  //     "Life is like a box of chocolates, you never know what you're gonna get.",
  //   audioSrc: '/audios/tara_20250320_130636.mp3',
  // },
  {
    id: 2,
    name: 'Tara (en-US) 🇺🇸',
    prompt: '<sigh> Oh my god <groan>. That was amazing! <gasp>',
    audioSrc: 'tara_amazing.mp3',
  },
  // {
  //   id: 3,
  //   name: 'Tara (en-US) 🇺🇸',
  //   prompt: '<sigh> Oh my god. This is fantastic! <laugh>',
  //   audioSrc: 'tara_fantastic.mp3',
  // },
  {
    id: 4,
    name: 'Dan (en-UK) 🇬🇧',
    prompt: `Alright, so, uhm, <chuckle> why do dogs run in circles before they lie down? <pause>
Because it's hard to lay down in a square! <laugh>
I mean, imagine a dog just trying to plop down in perfect 90-degree angles. <snicker> Pure chaos!`,
    audioSrc: 'dan_joke.mp3',
  },
  {
    id: 5,
    name: 'Emma (en-US) 🇺🇸',
    prompt:
      '<gasp> Ever dreamed ... of wielding legendary power, carving your destiny in a world of magic and wonder?',
    audioSrc: 'emma_wonder.mp3',
  },
  {
    id: 6,
    name: 'Javi (es-ES) 🇪🇸',
    prompt:
      'Bienvenido a SexyVoice.ai <resoplido> , tu puerta de entrada a la vanguardia de la innovación y el mundo de la tecnología. Soy tu anfitrión, Javi, y cada semana exploramos las últimas tendencias, avances y las personas que están dando forma al futuro de la tecnología.',
    audioSrc: 'javi_anfitrion.mp3',
  },
];

const get3PostsByLang = (lang: Locale) => {
  return allPosts.filter((post) => post.locale === lang)?.slice(0, 3);
};

export const metadata: Metadata = {
  other: {
    preconnect: 'https://uxjubqdyhv4aowsi.public.blob.vercel-storage.com',
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

  const parts = dict.hero.title.split(',');
  const firstPart = parts[0];
  const restParts = parts.slice(1).join(',');

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

      <Suspense fallback={<div>Loading...</div>}>
        <Header lang={lang} />
      </Suspense>
      <main id="main-content">
        {/* <div className="hidden sm:block absolute inset-0 overflow-hidden h-[102rem] md:h-[76.5rem]">
        <div className="absolute top-0 left-0 w-full h-full disable-bg-firefox bg-[radial-gradient(circle_at_30%_20%,rgba(142,129,171,0.1)_0%,rgba(0,0,0,0)_50%)]" />
        <div className="absolute bottom-0 right-0 w-full h-full disable-bg-firefox bg-[radial-gradient(circle_at_70%_80%,rgba(221,193,70,0.1)_0%,rgba(0,0,0,0)_50%)]" />
      </div> */}
        <div className="min-h-screen dark:bg-gradient-to-br disable-bg-firefox dark:from-gray-900 dark:to-gray-800">
          <div className="container mx-auto px-4">
            {/* Hero Section */}
            <div className="text-center space-y-6 py-20 z-10 md:pb-32">
              <LandingHero />
              <h1 className="text-5xl md:text-6xl font-bold text-white leading-10">
                <span className="leading-[3.5rem]">{firstPart}</span>
                {restParts && (
                  <span className="text-blue-400">{restParts}</span>
                )}
              </h1>
              <p className="text-xl text-gray-300 max-w-2xl py-12 mx-auto whitespace-break-spaces">
                {dict.hero.subtitle}
              </p>
              <div className="flex w-fit mx-auto flex-col gap-2">
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
            <div className="max-w-4xl mx-auto mb-16 md:pb-16">
              <h2 className="text-2xl font-bold text-white mb-2">
                Try Our Voice Samples
              </h2>
              <p className="text-gray-200 mb-6">
                Listen to sample voice clones created with our advanced AI
                technology
              </p>
              <div className="grid md:grid-cols-2 gap-6">
                {sampleAudios.map((audio) => (
                  <AudioPreviewCard
                    key={audio.id}
                    name={audio.name}
                    prompt={audio.prompt}
                    audioSrc={`https://uxjubqdyhv4aowsi.public.blob.vercel-storage.com/${audio.audioSrc}`}
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
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 py-16 xl:px-28">
              <Card className="group shadow-zinc-950/5">
                <CardHeader className="pb-3">
                  <CardDecorator>
                    <Mic2 className="size-6 text-blue-400" aria-hidden />
                  </CardDecorator>

                  <h3 className="mt-6 font-medium text-center">
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

                  <h3 className="mt-6 font-medium text-center">
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

                  <h3 className="mt-6 font-medium text-center">
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
            <div className="max-w-3xl mx-auto py-16">
              <div className="text-left md:text-center mb-12">
                <h2 className="text-3xl font-bold text-white mb-2">
                  {dict.faq.title}
                </h2>
                <p className="text-gray-200">{dict.faq.subtitle}</p>
              </div>

              <Accordion type="single" collapsible className="w-full">
                {dict.faq.questions.map((faq, index) => (
                  <AccordionItem
                    key={`item-${index}`}
                    value={`item-${index}`}
                    className="border-b border-white/10"
                  >
                    <AccordionTrigger className="text-white text-left hover:text-blue-400 hover:no-underline py-5">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-gray-200">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>

            {/* Blog posts Section */}
            <div className="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-1 gap-4 mx-auto lg:max-w-[400px]">
              <h2 className="text-2xl font-bold mb-4">{dict.latestPosts}</h2>
              {get3PostsByLang(lang).map((post, idx) => (
                <Card
                  className="lg:max-w-[400px] lg:min-w-[400px] mx-auto"
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
                          className="rounded-lg mx-auto"
                        />
                      )}
                      <CardTitle className="text-gray-200 text-lg leading-8 text-center">
                        {post.title}
                      </CardTitle>
                    </CardHeader>
                  </Link>
                </Card>
              ))}
            </div>
            {/* CTA Section */}
            <div className="text-center py-16 space-y-6">
              <div className="inline-flex items-center px-4 py-2 rounded-full bg-blue-600/20 text-blue-400 mb-4">
                <Sparkles className="size-4 mr-2" />
                <span>{dict.cta.freeCredits}</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-white">
                {dict.cta.title}
              </h2>
              <p className="text-xl text-gray-300 max-w-2xl mx-auto">
                {dict.cta.subtitle}
              </p>
              <Button
                size="lg"
                className="bg-blue-600 hover:bg-blue-700 mt-4"
                asChild
                effect="ringHover"
              >
                <Link href={`/${lang}/signup`}>{dict.cta.action}</Link>
              </Button>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

const CardDecorator = ({ children }: { children: ReactNode }) => (
  <div className="relative mx-auto size-36 duration-200 [--color-border:color-mix(in_oklab,var(--color-zinc-950)10%,transparent)] group-hover:[--color-border:color-mix(in_oklab,var(--color-zinc-950)20%,transparent)] dark:[--color-border:color-mix(in_oklab,var(--color-white)15%,transparent)] dark:group-hover:bg-white/5 dark:group-hover:[--color-border:color-mix(in_oklab,var(--color-white)20%,transparent)]">
    <div
      aria-hidden
      className="absolute inset-0 bg-grid-gradient bg-[size:24px_24px]"
    />
    <div
      aria-hidden
      className="bg-radial to-card absolute inset-0 from-transparent to-75%"
    />
    <div className="bg-card absolute inset-0 m-auto flex size-12 items-center justify-center border-l border-t">
      {children}
    </div>
  </div>
);
