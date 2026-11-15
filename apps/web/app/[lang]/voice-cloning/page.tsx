import { PhoneCall } from 'lucide-react';
import type { Metadata } from 'next';
import { getMessages, getTranslations } from 'next-intl/server';

import { DemoCloneSection } from '@/components/demo-clone/demo-clone-section';
import { FAQComponent } from '@/components/faq';
import HeroWaveform from '@/components/hero-waveform';
import { MarketingPage } from '@/components/marketing-page';
import { CtaSection, HeroTitle } from '@/components/marketing-sections';
import { Button } from '@/components/ui/button';
import type { Locale } from '@/lib/i18n/i18n-config';
import { Link } from '@/lib/i18n/navigation';
import { pageMetadata } from '@/lib/page-metadata';
import { graph, organization, webPage, webSite } from '@/lib/structured-data';

interface Props {
  params: Promise<{ lang: Locale }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const t = await getTranslations({ locale: lang, namespace: 'pages' });
  return pageMetadata({
    description: t('descriptionVoiceCloning'),
    lang,
    path: '/voice-cloning',
    title: t('titleVoiceCloning'),
  });
}

export default async function VoiceCloningPage(props: Props) {
  const { lang } = await props.params;

  const messages = (await getMessages({ locale: lang })) as IntlMessages;
  const dictLanding = messages.landing;

  const jsonLd = graph(
    organization(),
    webSite({ description: messages.pages.description, lang }),
    webPage({
      description: messages.pages.descriptionVoiceCloning,
      lang,
      name: messages.pages.titleVoiceCloning,
      path: '/voice-cloning',
    }),
  );

  return (
    <MarketingPage banner jsonLd={jsonLd} lang={lang}>
      <div className="min-h-screen bg-linear-to-br from-background to-zinc-800">
        <div className="container mx-auto px-4">
          {/* Hero Section */}
          <div className="z-10 space-y-6 pt-10 pb-16 text-center md:pt-16 md:pb-24">
            <div className="hidden md:block">
              <HeroWaveform />
            </div>
            <HeroTitle
              className="text-balance font-bold text-4xl leading-tight sm:text-5xl md:text-6xl"
              title={dictLanding.voiceCloning.hero.title}
            />
            <p className="mx-auto max-w-2xl whitespace-break-spaces text-pretty text-base text-gray-300 leading-7 sm:text-xl sm:leading-8">
              {dictLanding.voiceCloning.hero.subtitle}
            </p>

            <DemoCloneSection lang={lang} />
          </div>

          {/* Calling Section */}
          <section className="mx-auto max-w-3xl py-16">
            <div className="space-y-6 rounded-2xl border border-fuchsia-800/60 bg-white/5 p-8 text-center md:p-12">
              <div className="inline-flex items-center rounded-full bg-fuchsia-600/20 p-3 text-fuchsia-300">
                <PhoneCall aria-hidden className="size-6" />
              </div>
              <h2 className="text-balance font-bold text-3xl text-white md:text-4xl">
                {dictLanding.voiceCloning.callSection.title}
              </h2>
              <p className="mx-auto max-w-2xl text-pretty text-gray-300 text-lg leading-8">
                {dictLanding.voiceCloning.callSection.subtitle}
              </p>
              <div className="flex flex-col items-center gap-2">
                <Button
                  asChild
                  className="hit-area-4 bg-fuchsia-600 hover:bg-fuchsia-700"
                  effect="ringHover"
                  size="lg"
                >
                  <Link href="/voice-call">
                    {dictLanding.voiceCloning.callSection.action}
                  </Link>
                </Button>
                <p className="text-pretty text-gray-400 text-xs">
                  {dictLanding.voiceCloning.callSection.note}
                </p>
              </div>
            </div>
          </section>

          {/* FAQ Section */}
          <div className="mx-auto max-w-3xl py-16">
            <FAQComponent lang={lang} priorityGroupIds={['voiceCloning']} />
          </div>

          <CtaSection cta={dictLanding.voiceCloning.cta} />
        </div>
      </div>
    </MarketingPage>
  );
}
