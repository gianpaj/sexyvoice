import { Globe2, Mic2, Play, Shield, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { lazy, Suspense } from 'react';
import { Button } from '@/components/ui/button';

import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Locale } from '@/lib/i18n/i18n-config';
// import { VoiceGenerator } from "@/components/voice-generator";
// import { PopularAudios } from '@/components/popular-audios';

import { AudioPreviewCard } from '@/components/audio-preview-card';
import Footer from '@/components/footer';
import { Header } from '@/components/header';
import LandingHero from '@/components/landing-hero';
import PricingTable from '@/components/pricing-table';

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
    name: 'Tara',
    prompt: '<sigh> Oh my god <groan>. That was amazing! <gasp>',
    audioSrc: 'tara_amazing.mp3',
  },
  {
    id: 3,
    name: 'Tara',
    prompt: '<sigh> Oh my god. This is fantastic! <laugh>',
    audioSrc: 'tara_fantastic.mp3',
  },
  {
    id: 4,
    name: 'Dan',
    prompt: `Alright, so, uhm, <chuckle> why do dogs run in circles before they lie down? <pause>
Because it's hard to lay down in a square! <laugh>
I mean, imagine a dog just trying to plop down in perfect 90-degree angles. <snicker> Pure chaos!`,
    audioSrc: 'dan_joke.mp3',
  },
  {
    id: 5,
    name: 'Emma',
    prompt:
      '<gasp> Ever dreamed ... of wielding legendary power, carving your destiny in a world of magic and wonder?',
    audioSrc: 'emma_wonder.mp3',
  },
  // {
  //   id: 4,
  //   name: 'Emma Watson',
  //   prompt:
  //     'Education is the most powerful weapon which you can use to change the world.',
  //   audioSrc: '/audios/emma-watson.mp3',
  // },
];

export default async function LandingPage(props: {
  params: Promise<{ lang: Locale }>;
}) {
  const params = await props.params;

  const { lang } = params;

  const dict = await getDictionary(lang);

  return (
    <>
      <link
        rel="preconnect"
        href="https://uxjubqdyhv4aowsi.public.blob.vercel-storage.com"
      />
      <Suspense fallback={<div>Loading...</div>}>
        <Header lang={lang} />
      </Suspense>
      <div className="min-h-screen dark:bg-gradient-to-br dark:from-gray-900 dark:to-gray-800">
        <div className="container mx-auto px-4">
          {/* Hero Section */}
          <div className="text-center space-y-6 py-20">
            <LandingHero />
            <h1 className="text-5xl md:text-6xl font-bold text-white">
              {dict.landing.hero.title.split(',').map((part, i) => (
                <span key={i}>
                  {i === 0 ? (
                    part
                  ) : (
                    <span className="text-blue-400">{part}</span>
                  )}
                </span>
              ))}
            </h1>
            <p className="text-xl text-gray-300 max-w-2xl mx-auto">
              {dict.landing.hero.subtitle}
            </p>
          </div>

          {/* Audio Previews Grid */}
          <div className="max-w-4xl mx-auto mb-16">
            <h2 className="text-2xl font-bold text-white mb-2">
              Try Our Voice Samples
            </h2>
            <p className="text-gray-300 mb-6">
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
                {dict.landing.generator.title}
              </h2>
              <p className="text-gray-300">{dict.landing.generator.subtitle}</p>
            </div>
            <VoiceGenerator
              dict={dict.landing.generator}
              download={dict.landing.generator.download}
            />
          </div> */}

          {/* Popular Audios Section */}
          {/* <div className="max-w-4xl mx-auto mb-16">
            <h2 className="text-2xl font-bold text-white mb-2">
              {dict.landing.popular.title}
            </h2>
            <p className="text-gray-300 mb-6">
              {dict.landing.popular.subtitle}
            </p>
            <PopularAudios dict={dict.landing.popular} />
          </div> */}

          {/* Features Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 py-16 sm:px-28">
            <div className="bg-white/10 rounded-xl p-6 backdrop-blur-sm">
              <div className="size-12 bg-blue-600/20 rounded-lg flex items-center justify-center mb-4">
                <Mic2 className="size-6 text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">
                {dict.landing.features.voiceCloning.title}
              </h3>
              <p className="text-gray-300">
                {dict.landing.features.voiceCloning.description}
              </p>
            </div>

            <div className="bg-white/10 rounded-xl p-6 backdrop-blur-sm">
              <div className="size-12 bg-blue-600/20 rounded-lg flex items-center justify-center mb-4">
                <Globe2 className="size-6 text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">
                {dict.landing.features.multiLanguage.title}
              </h3>
              <p className="text-gray-300">
                {dict.landing.features.multiLanguage.description}
              </p>
            </div>

            <div className="bg-white/10 rounded-xl p-6 backdrop-blur-sm">
              <div className="size-12 bg-blue-600/20 rounded-lg flex items-center justify-center mb-4">
                <Shield className="size-6 text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">
                {dict.landing.features.security.title}
              </h3>
              <p className="text-gray-300">
                {dict.landing.features.security.description}
              </p>
            </div>
          </div>

          <PricingTable dict={dict} lang={lang} />

          {/* CTA Section */}
          <div className="text-center py-16 space-y-6">
            <div className="inline-flex items-center px-4 py-2 rounded-full bg-blue-600/20 text-blue-400 mb-4">
              <Sparkles className="size-4 mr-2" />
              <span>{dict.landing.cta.freeCredits}</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-white">
              {dict.landing.cta.title}
            </h2>
            <p className="text-xl text-gray-300 max-w-2xl mx-auto">
              {dict.landing.cta.subtitle}
            </p>
            <Button
              size="lg"
              className="bg-blue-600 hover:bg-blue-700 mt-4"
              asChild
            >
              <Link href={`/${lang}/signup`}>{dict.landing.cta.action}</Link>
            </Button>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
