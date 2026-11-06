import { EyeOff, Lock, MessageCircleOff, Wand2 } from 'lucide-react';
import type { Metadata } from 'next';
import { getMessages, getTranslations } from 'next-intl/server';
import ReactDOM from 'react-dom';

import { CardDecorator } from '@/components/card-decorator';
import { DemoCallSection } from '@/components/demo-call/demo-call-section';
import { FAQComponent } from '@/components/faq';
import HeroWaveform from '@/components/hero-waveform';
import { MarketingPage } from '@/components/marketing-page';
import { CtaSection, HeroTitle } from '@/components/marketing-sections';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { demoCallData } from '@/data/demo-transcripts';
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
    description: t('descriptionVoiceCall'),
    lang,
    path: '/voice-call',
    title: t('titleVoiceCall'),
  });
}

export default async function LandingPage(props: Props) {
  const { lang } = await props.params;

  // Warm the HTTP cache for the demo call the visitor is most likely to play:
  // Ramona is the character selected by default. `crossOrigin` must match the
  // `<audio crossOrigin="anonymous">` the player creates, or the browser keys
  // the preload separately and downloads the clip twice.
  ReactDOM.preload(demoCallData.ramona.audioSrc, {
    as: 'audio',
    crossOrigin: 'anonymous',
  });

  const messages = (await getMessages({ locale: lang })) as IntlMessages;
  const dictLanding = messages.landing;

  const dictPrivacy = dictLanding.voiceCall.privacy;
  const dictCustomCharacter = dictLanding.voiceCall.customCharacter;
  const privacyPoints = [
    { Icon: MessageCircleOff, ...dictPrivacy.unrestricted },
    { Icon: Lock, ...dictPrivacy.encrypted },
    { Icon: EyeOff, ...dictPrivacy.forgotten },
  ];

  const jsonLd = graph(
    organization(),
    webSite({ description: messages.pages.description, lang }),
    webPage({
      description: messages.pages.descriptionVoiceCall,
      lang,
      name: messages.pages.titleVoiceCall,
      path: '/voice-call',
    }),
  );

  return (
    <MarketingPage banner jsonLd={jsonLd} lang={lang}>
      <div className="min-h-screen bg-linear-to-br from-background to-zinc-800">
        <div className="container mx-auto px-4">
          {/* Hero Section */}
          <div className="z-10 space-y-6 py-20 text-center md:pb-32">
            <HeroWaveform />
            <HeroTitle
              className="text-balance font-bold text-5xl leading-14 md:text-6xl"
              title={dictLanding.voiceCall.hero.title}
            />
            <p className="mx-auto max-w-2xl whitespace-break-spaces text-pretty py-12 text-gray-300 text-xl leading-8 sm:leading-10">
              {dictLanding.voiceCall.hero.subtitle}
            </p>

            <DemoCallSection lang={lang} />
          </div>

          {/* Privacy Section */}
          <section className="mx-auto max-w-4xl space-y-6 py-16 text-center">
            <h2 className="text-balance font-bold text-3xl text-white md:text-4xl">
              {dictPrivacy.title}
            </h2>
            <p className="mx-auto max-w-2xl text-pretty text-gray-300 text-xl leading-8">
              {dictPrivacy.subtitle}
            </p>
            <div className="grid gap-6 pt-4 md:grid-cols-3">
              {privacyPoints.map(({ Icon, title, description }) => (
                <Card
                  className="mx-auto max-w-sm shadow-zinc-950/5"
                  key={title}
                >
                  <CardHeader>
                    <CardDecorator>
                      <Icon aria-hidden className="size-6 text-gray-200" />
                    </CardDecorator>

                    <h3 className="mt-6 text-balance text-center font-medium text-pink-200">
                      {title}
                    </h3>
                  </CardHeader>
                  <CardContent>
                    <p className="text-justify text-sm">{description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* Custom Character Section */}
          <section className="mx-auto max-w-3xl py-16">
            <div className="space-y-6 rounded-2xl border border-fuchsia-800/60 bg-white/5 p-8 text-center md:p-12">
              <div className="inline-flex items-center rounded-full bg-fuchsia-600/20 p-3 text-fuchsia-300">
                <Wand2 aria-hidden className="size-6" />
              </div>
              <h2 className="text-balance font-bold text-3xl text-white md:text-4xl">
                {dictCustomCharacter.title}
              </h2>
              <p className="mx-auto max-w-2xl text-pretty text-gray-300 text-lg leading-8">
                {dictCustomCharacter.subtitle}
              </p>
              <div className="flex flex-col items-center gap-2">
                <Button
                  asChild
                  className="hit-area-4 bg-fuchsia-600 hover:bg-fuchsia-700"
                  effect="ringHover"
                  size="lg"
                >
                  <Link href="/signup">{dictCustomCharacter.action}</Link>
                </Button>
                <p className="text-pretty text-gray-400 text-xs">
                  {dictCustomCharacter.note}
                </p>
                <Link
                  className="hit-area-y-2 mt-2 font-medium text-fuchsia-300 text-sm underline-offset-4 hover:underline"
                  href="/voice-cloning"
                >
                  {dictCustomCharacter.cloningLink} →
                </Link>
              </div>
            </div>
          </section>

          {/* FAQ Section */}
          <div className="mx-auto max-w-3xl py-16">
            <FAQComponent lang={lang} />
          </div>

          <CtaSection cta={dictLanding.voiceCall.cta} />
        </div>
      </div>
    </MarketingPage>
  );
}
