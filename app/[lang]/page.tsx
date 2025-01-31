import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Mic2, Globe2, Shield, Sparkles } from 'lucide-react'
import { getDictionary } from '@/lib/i18n/get-dictionary'
import { LanguageSelector } from '@/components/language-selector'
import type { Locale } from '@/lib/i18n/i18n-config'

export default async function LandingPage({
  params: { lang }
}: {
  params: { lang: Locale }
}) {
  const { landing } = await getDictionary(lang)

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800">
      <div className="container mx-auto px-4">
        {/* Language Selector */}
        <div className="flex justify-end pt-6">
          <LanguageSelector currentLang={lang} />
        </div>

        {/* Hero Section */}
        <div className="space-y-6 py-20 text-center">
          <h1 className="text-5xl font-bold text-white md:text-6xl">
            {landing.hero.title.split(',').map((part, i) => (
              <span key={i}>
                {i === 0 ? part : <span className="text-blue-400">{part}</span>}
              </span>
            ))}
          </h1>
          <p className="mx-auto max-w-2xl text-xl text-gray-300">
            {landing.hero.subtitle}
          </p>
          <div className="flex justify-center gap-4 pt-4">
            <Link href={`/${lang}/signup`}>
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700">
                {landing.hero.getStarted}
              </Button>
            </Link>
            <Link href={`/${lang}/login`}>
              <Button
                size="lg"
                variant="outline"
                className="text-dark border-white hover:bg-white/10"
              >
                {landing.hero.signIn}
              </Button>
            </Link>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid gap-8 py-16 md:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl bg-white/10 p-6 backdrop-blur-sm">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-600/20">
              <Mic2 className="h-6 w-6 text-blue-400" />
            </div>
            <h3 className="mb-2 text-xl font-semibold text-white">
              {landing.features.voiceCloning.title}
            </h3>
            <p className="text-gray-300">
              {landing.features.voiceCloning.description}
            </p>
          </div>

          <div className="rounded-xl bg-white/10 p-6 backdrop-blur-sm">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-600/20">
              <Globe2 className="h-6 w-6 text-blue-400" />
            </div>
            <h3 className="mb-2 text-xl font-semibold text-white">
              {landing.features.multiLanguage.title}
            </h3>
            <p className="text-gray-300">
              {landing.features.multiLanguage.description}
            </p>
          </div>

          <div className="rounded-xl bg-white/10 p-6 backdrop-blur-sm">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-600/20">
              <Shield className="h-6 w-6 text-blue-400" />
            </div>
            <h3 className="mb-2 text-xl font-semibold text-white">
              {landing.features.security.title}
            </h3>
            <p className="text-gray-300">
              {landing.features.security.description}
            </p>
          </div>
        </div>

        {/* CTA Section */}
        <div className="space-y-6 py-16 text-center">
          <div className="mb-4 inline-flex items-center rounded-full bg-blue-600/20 px-4 py-2 text-blue-400">
            <Sparkles className="mr-2 h-4 w-4" />
            <span>{landing.cta.freeCredits}</span>
          </div>
          <h2 className="text-3xl font-bold text-white md:text-4xl">
            {landing.cta.title}
          </h2>
          <p className="mx-auto max-w-2xl text-xl text-gray-300">
            {landing.cta.subtitle}
          </p>
          <Link href={`/${lang}/signup`}>
            <Button size="lg" className="mt-4 bg-blue-600 hover:bg-blue-700">
              {landing.cta.action}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
