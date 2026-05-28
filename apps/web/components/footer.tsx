import Link from 'next/link';
import { getMessages } from 'next-intl/server';

import type { Locale } from '@/lib/i18n/i18n-config';

async function Footer({ lang }: { lang: Locale }) {
  const dict = ((await getMessages({ locale: lang })) as IntlMessages).footer;
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-white/5 border-t bg-black">
      <div className="container mx-auto px-6 py-10 md:py-16">
        {/* Top: Brand + Link columns */}
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5 lg:gap-12">
          {/* Brand column */}
          <div className="col-span-2 sm:col-span-3 lg:col-span-2">
            <Link
              className="inline-block font-bold text-foreground text-lg tracking-tight"
              href={`/${lang}`}
            >
              SexyVoice.ai
            </Link>
            <p className="mt-2 max-w-xs text-muted-foreground text-sm leading-relaxed">
              {dict.tagline}
            </p>
            {/* Social icons */}
            <div className="mt-5 flex items-center gap-3">
              <Link
                aria-label="Twitter/X"
                className="hit-area-2 flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
                href="https://x.com/sexyvoiceai"
                rel="noopener noreferrer"
                target="_blank"
              >
                <span className="iconify logos--x" />
              </Link>
              <Link
                aria-label="Instagram"
                className="hit-area-2 flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
                href="https://instagram.com/sexyvoice_ai"
                rel="noopener noreferrer"
                target="_blank"
              >
                <span className="iconify logos--instagram-icon" />
              </Link>
            </div>
          </div>

          {/* Tools column */}
          <div>
            <h3 className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
              {dict.toolsHeading}
            </h3>
            <ul className="space-y-2.5">
              <li>
                <Link
                  className="hit-area-y-1 text-gray-400 text-sm transition-colors hover:text-foreground"
                  href={`/${lang}/tools/audio-converter`}
                >
                  {dict.audioConverter}
                </Link>
              </li>
              <li>
                <Link
                  className="hit-area-y-1 text-gray-400 text-sm transition-colors hover:text-foreground"
                  href={`/${lang}/tools/transcribe`}
                >
                  {dict.transcribe}
                </Link>
              </li>
              <li>
                <Link
                  className="hit-area-y-1 text-gray-400 text-sm transition-colors hover:text-foreground"
                  href={`/${lang}/tools/audio-joiner`}
                >
                  {dict.audioJoiner}
                </Link>
              </li>
            </ul>
          </div>

          {/* Company column */}
          <div>
            <h3 className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
              {dict.companyHeading}
            </h3>
            <ul className="space-y-2.5">
              <li>
                <a
                  className="hit-area-y-1 text-gray-400 text-sm transition-colors hover:text-foreground"
                  href="https://sexyvoice.checkly-dashboards.com/"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {dict.statusPage}
                </a>
              </li>
            </ul>
          </div>

          {/* Legal column */}
          <div>
            <h3 className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
              {dict.legalHeading}
            </h3>
            <ul className="space-y-2.5">
              <li>
                <Link
                  className="hit-area-y-1 text-gray-400 text-sm transition-colors hover:text-foreground"
                  href={`/${lang}/privacy-policy`}
                >
                  {dict.privacyPolicy}
                </Link>
              </li>
              <li>
                <Link
                  className="hit-area-y-1 text-gray-400 text-sm transition-colors hover:text-foreground"
                  href={`/${lang}/terms`}
                >
                  {dict.termsAndConditions}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Divider + Copyright */}
        <div className="mt-10 border-white/5 border-t pt-6 md:mt-14">
          <p className="text-center text-gray-500 text-xs">
            &copy; {currentYear} {dict.copyright}
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
