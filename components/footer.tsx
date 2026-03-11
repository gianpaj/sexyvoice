import { getMessages } from 'next-intl/server';
import Link from 'next/link';

import type { Locale } from '@/lib/i18n/i18n-config';

async function Footer({ lang }: { lang: Locale }) {
  const dict = ((await getMessages({ locale: lang })) as IntlMessages).footer;
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-white/5 bg-[hsl(222,84%,3.5%)]">
      <div className="container mx-auto px-6 py-10 md:py-16">
        {/* Top: Brand + Link columns */}
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5 lg:gap-12">
          {/* Brand column */}
          <div className="col-span-2 sm:col-span-3 lg:col-span-2">
            <Link
              href={`/${lang}`}
              className="inline-block text-lg font-bold tracking-tight text-foreground"
            >
              SexyVoice.ai
            </Link>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
              {dict.tagline}
            </p>
            {/* Social icons */}
            <div className="mt-5 flex items-center gap-3">
              <Link
                href="https://x.com/SexyvoiceAi"
                target="_blank"
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground hit-area-2"
                aria-label="Twitter/X"
              >
                <span className="iconify logos--x" />
              </Link>
              <Link
                href="https://instagram.com/sexyvoice_ai"
                target="_blank"
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground hit-area-2"
                aria-label="Instagram"
              >
                <span className="iconify logos--instagram-icon" />
              </Link>
            </div>
          </div>

          {/* Tools column */}
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {dict.toolsHeading}
            </h3>
            <ul className="space-y-2.5">
              <li>
                <Link
                  href={`/${lang}/tools/audio-converter`}
                  className="text-sm text-gray-400 transition-colors hover:text-foreground hit-area-y-1"
                >
                  {dict.audioConverter}
                </Link>
              </li>
              <li>
                <Link
                  href={`/${lang}/tools/transcribe`}
                  className="text-sm text-gray-400 transition-colors hover:text-foreground hit-area-y-1"
                >
                  {dict.transcribe}
                </Link>
              </li>
              <li>
                <Link
                  href={`/${lang}/tools/audio-joiner`}
                  className="text-sm text-gray-400 transition-colors hover:text-foreground hit-area-y-1"
                >
                  {dict.audioJoiner}
                </Link>
              </li>
            </ul>
          </div>

          {/* Company column */}
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {dict.companyHeading}
            </h3>
            <ul className="space-y-2.5">
              <li>
                <a
                  href="https://sexyvoice.checkly-dashboards.com/"
                  rel="noreferrer"
                  target="_blank"
                  className="text-sm text-gray-400 transition-colors hover:text-foreground hit-area-y-1"
                >
                  {dict.statusPage}
                </a>
              </li>
            </ul>
          </div>

          {/* Legal column */}
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {dict.legalHeading}
            </h3>
            <ul className="space-y-2.5">
              <li>
                <Link
                  href={`/${lang}/privacy-policy`}
                  className="text-sm text-gray-400 transition-colors hover:text-foreground hit-area-y-1"
                >
                  {dict.privacyPolicy}
                </Link>
              </li>
              <li>
                <Link
                  href={`/${lang}/terms`}
                  className="text-sm text-gray-400 transition-colors hover:text-foreground hit-area-y-1"
                >
                  {dict.termsAndConditions}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Divider + Copyright */}
        <div className="mt-10 border-t border-white/5 pt-6 md:mt-14">
          <p className="text-center text-xs text-gray-500">
            &copy; {currentYear} {dict.copyright}
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
