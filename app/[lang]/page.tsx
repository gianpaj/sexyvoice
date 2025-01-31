import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Mic2, Globe2, Shield, Sparkles } from 'lucide-react';
import { getDictionary } from '@/lib/i18n/get-dictionary';
import { LanguageSelector } from '@/components/language-selector';
import type { Locale } from '@/lib/i18n/i18n-config';
import { VoiceGenerator } from '@/components/voice-generator';
import { PopularAudios } from '@/components/popular-audios';
import type { Metadata } from 'next';
import { Header } from '@/components/header';

// export const metadata: Metadata = {
//   title: 'SexyVoice.ai - AI Voice Cloning Platform',
//   description:
//     'Create stunning voice clones with advanced AI technology. Perfect for content creators, developers, and storytellers.',
// };

export default async function LandingPage({
  params: { lang },
}: {
  params: { lang: Locale };
}) {
  const dict = await getDictionary(lang);

  return (
    <>
      <Header lang={lang} />
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800">
        <div className="container mx-auto px-4">
          {/* Language Selector */}
          <div className="flex justify-end pt-6">
            <LanguageSelector currentLang={lang} />
          </div>

          {/* Hero Section */}
          <div className="text-center space-y-6 py-20">
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

          {/* Voice Generator Section */}
          <div className="max-w-2xl mx-auto bg-white/10 backdrop-blur-sm rounded-xl p-8 mb-16">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white mb-2">
                {dict.landing.generator.title}
              </h2>
              <p className="text-gray-300">{dict.landing.generator.subtitle}</p>
            </div>
            <VoiceGenerator dict={dict.landing.generator} />
          </div>

          {/* Popular Audios Section */}
          <div className="max-w-4xl mx-auto mb-16">
            <h2 className="text-2xl font-bold text-white mb-2">
              {dict.landing.popular.title}
            </h2>
            <p className="text-gray-300 mb-6">
              {dict.landing.popular.subtitle}
            </p>
            <PopularAudios dict={dict.landing.popular} />
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 py-16">
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
            <Link href={`/${lang}/signup`}>
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700 mt-4">
                {dict.landing.cta.action}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
