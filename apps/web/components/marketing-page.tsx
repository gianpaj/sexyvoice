import { getMessages, setRequestLocale } from 'next-intl/server';
import { Fragment, type ReactNode } from 'react';
import type { Graph } from 'schema-dts';

import { Banner } from '@/components/banner';
import Footer from '@/components/footer';
import { HeaderStatic } from '@/components/header-static';
import { JsonLd } from '@/components/json-ld';
import { resolveActiveBanner } from '@/lib/banners/resolve-banner';
import type { Locale } from '@/lib/i18n/i18n-config';
import { cn } from '@/lib/utils';

interface MarketingPageProps {
  /** Forwarded to the header's login and signup links. */
  authRedirectTo?: string | null;
  /** Shows the active promo or announcement banner above the header. */
  banner?: boolean;
  children: ReactNode;
  /** Classes for the `<main>` element. */
  className?: string;
  jsonLd?: Graph;
  lang: Locale;
}

/**
 * The chrome of a public page: structured data, banner, header, the
 * `#main-content` target of the layout's skip link, and footer.
 *
 * It reads no cookies, so the page stays static and cacheable. `Banner`
 * starts hidden and checks its dismissal cookie in the browser.
 */
export async function MarketingPage({
  authRedirectTo,
  banner = false,
  children,
  className,
  jsonLd,
  lang,
}: MarketingPageProps) {
  // next-intl reads the locale from request headers unless the page sets
  // it, and reading headers opts the page out of static rendering.
  setRequestLocale(lang);
  const activeBanner = banner
    ? resolveActiveBanner({
        audience: 'loggedOut',
        lang,
        messages: await getMessages({ locale: lang }),
        placement: 'landing',
      })
    : null;

  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      {activeBanner && <Banner banner={activeBanner} />}
      <HeaderStatic authRedirectTo={authRedirectTo} />
      <main className={className} id="main-content">
        {children}
      </main>
      <Footer lang={lang} />
    </>
  );
}

interface ToolPageProps {
  children: ReactNode;
  /** The projects the tool runs on, linked in the attribution bar. */
  credits: Array<{ href: string; label: string }>;
  jsonLd: Graph;
  lang: Locale;
  noUploads: string;
  poweredBy: string;
  width: 'max-w-3xl' | 'max-w-5xl';
}

/** A free browser tool, with the attribution its licenses ask for. */
export function ToolPage({
  children,
  credits,
  jsonLd,
  lang,
  noUploads,
  poweredBy,
  width,
}: ToolPageProps) {
  return (
    <MarketingPage jsonLd={jsonLd} lang={lang}>
      <div className="bg-background">
        <div className={cn('container mx-auto px-4 py-12 md:py-20', width)}>
          {children}
        </div>
      </div>
      <div className="border-white/5 border-t bg-[hsl(222,84%,3.5%)] py-5 text-center text-muted-foreground text-sm">
        <p>
          {poweredBy}{' '}
          {credits.map((credit) => (
            <Fragment key={credit.href}>
              <a
                className="font-semibold text-foreground transition-colors hover:text-primary"
                href={credit.href}
                rel="noopener noreferrer"
                target="_blank"
              >
                {credit.label}
              </a>{' '}
              &bull;{' '}
            </Fragment>
          ))}
          {noUploads}
        </p>
      </div>
    </MarketingPage>
  );
}
