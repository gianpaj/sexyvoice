import {
  ArrowRightIcon,
  AudioLines,
  Globe2,
  type LucideIcon,
  Mic2,
  PhoneCall,
  Shield,
} from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import { getMessages, getTranslations } from 'next-intl/server';
import { preconnect } from 'react-dom';

import { CardDecorator } from '@/components/card-decorator';
import { FAQComponent } from '@/components/faq';
import HeroWaveform from '@/components/hero-waveform';
import { MarketingPage } from '@/components/marketing-page';
import { CtaSection, HeroTitle } from '@/components/marketing-sections';
import PricingTable from '@/components/pricing-table';
import { SampleAudioPreviews } from '@/components/sample-audio-previews';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { listPostsWithCover, postPath } from '@/lib/content';
import type { Locale } from '@/lib/i18n/i18n-config';
import { Link } from '@/lib/i18n/navigation';
import {
  getLandingContent,
  type LandingFeatureKey,
} from '@/lib/landing-content';
import { pageMetadata } from '@/lib/page-metadata';
import { FILES_URL } from '@/lib/site';
import {
  faqPage,
  graph,
  organization,
  webPage,
  webSite,
} from '@/lib/structured-data';
import { getSampleAudiosByLanguage } from '../sample-audio';

const FEATURE_ICONS: Record<LandingFeatureKey, LucideIcon> = {
  multiLanguage: Globe2,
  security: Shield,
  voiceCalling: PhoneCall,
  voiceCloneDemo: AudioLines,
  voiceCloning: Mic2,
};

/** A feature card; cards with a page link highlight on hover. */
function FeatureCard({
  description,
  href,
  icon: Icon,
  title,
}: {
  description: string;
  href?: string;
  icon: LucideIcon;
  title: string;
}) {
  const card = (
    <Card
      className={
        href
          ? 'h-full border-fuchsia-400/25 bg-white/3 shadow-zinc-950/5 transition-colors group-hover:border-fuchsia-400/60 group-hover:bg-fuchsia-400/8'
          : 'group max-w-sm border-white/10 bg-white/3 shadow-zinc-950/5'
      }
    >
      <CardHeader>
        <CardDecorator>
          <Icon
            aria-hidden
            className={
              href
                ? 'size-6 text-gray-200 transition-colors group-hover:text-white'
                : 'size-6 text-gray-200'
            }
          />
        </CardDecorator>

        <h3
          className={
            href
              ? 'mt-6 text-balance text-center font-medium text-pink-200 transition-colors group-hover:text-pink-100'
              : 'mt-6 text-balance text-center font-medium text-pink-200'
          }
        >
          {title}
        </h3>
      </CardHeader>

      <CardContent>
        <p className="text-pretty text-center text-sm text-zinc-300">
          {description}
        </p>
      </CardContent>
    </Card>
  );

  return href ? (
    <Link className="group max-w-sm rounded-xl" href={href} prefetch>
      {card}
    </Link>
  ) : (
    card
  );
}

export async function generateMetadata(props: {
  params: Promise<{ lang: Locale }>;
}): Promise<Metadata> {
  const { lang } = await props.params;
  const t = await getTranslations({ locale: lang, namespace: 'pages' });
  return pageMetadata({
    description: t('description'),
    keywords: t('keywordsLanding'),
    lang,
    path: '/',
    title: t('defaultTitle'),
  });
}

export default async function LandingPage(props: {
  params: Promise<{ lang: Locale }>;
}) {
  const { lang } = await props.params;
  // The sample previews stream from the files host.
  preconnect(FILES_URL);

  const messages = (await getMessages({ locale: lang })) as IntlMessages;
  const dictLanding = messages.landing;
  const content = getLandingContent(dictLanding);

  const page = webPage({
    description: messages.pages.description,
    lang,
    name: messages.pages.defaultTitle,
    path: '/',
  });
  const jsonLd = graph(
    organization(),
    webSite({ description: messages.pages.description, lang }),
    page,
    faqPage({
      isPartOf: page,
      lang,
      path: '/',
      questions: content.faq.groups.flatMap((group) => group.questions),
    }),
  );

  return (
    <MarketingPage banner jsonLd={jsonLd} lang={lang}>
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
            <HeroTitle
              className="text-balance font-bold text-5xl leading-14 sm:leading-17 md:text-6xl max-sm:[&:lang(de)]:text-4xl max-sm:[&:lang(de)]:leading-12"
              title={content.hero.title}
            />
            <p className="mx-auto max-w-2xl text-balance text-gray-300 text-xl leading-8 sm:leading-10">
              {content.hero.subtitle.split('\n').map((line) => (
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
                <Link href="/signup">{content.hero.buttonCTA}</Link>
              </Button>
              <p className="text-gray-300 text-xs">
                {content.hero.noCreditCard}
              </p>
            </div>
          </div>

          {/* Audio Previews Grid */}
          <SampleAudioPreviews
            initialAudios={getSampleAudiosByLanguage(lang)}
            trySamplesSubtitle={content.samples.subtitle}
            trySamplesTitle={content.samples.title}
          />

          {/* Features Grid */}
          <div className="mx-auto grid max-w-5xl justify-items-center gap-6 py-16 sm:grid-cols-2 lg:grid-cols-6 lg:*:col-span-2 lg:*:first:col-start-2">
            {content.features.map((feature) => (
              <FeatureCard
                description={feature.description}
                href={'href' in feature ? feature.href : undefined}
                icon={FEATURE_ICONS[feature.key]}
                key={feature.key}
                title={feature.title}
              />
            ))}
          </div>

          <div className="flex flex-col">
            <h2 className="mx-auto mb-4 text-pretty font-semibold text-2xl">
              {messages.credits.pricingPlan}
            </h2>
            <PricingTable className="py-4 pb-16 xl:px-10" lang={lang} />
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
            {listPostsWithCover(lang, 3).map((post) => (
              <Card
                className="relative max-w-sm pt-0 lg:min-w-[400px] lg:max-w-[400px]"
                key={post.slug}
              >
                {post.image && (
                  <Link href={postPath(post)} prefetch>
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
                    <Link href={postPath(post)}>{post.title}</Link>
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

          <CtaSection cta={content.cta} />
        </div>
      </div>
    </MarketingPage>
  );
}
