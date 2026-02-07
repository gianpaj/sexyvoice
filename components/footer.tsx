import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Locale } from '@/lib/i18n/i18n-config';

async function Footer({ lang }: { lang: Locale }) {
  const dict = await getDictionary(lang, 'footer');
  const currentYear = new Date().getFullYear();
  return (
    <footer className="bg-gray-900 py-12">
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex flex-col items-center">
          <div className="mb-8 flex space-x-4">
            <Button
              asChild
              className="rounded-full bg-gray-900"
              size="icon"
              variant="outline"
            >
              <Link href="https://x.com/SexyvoiceAi" target="_blank">
                <span className="iconify logos--x" />
                <span className="sr-only">Twitter/X</span>
              </Link>
            </Button>
            <Button
              asChild
              className="rounded-full bg-gray-900"
              size="icon"
              variant="outline"
            >
              <Link href="https://instagram.com/sexyvoice_ai" target="_blank">
                <span className="iconify logos--instagram-icon" />
                <span className="sr-only">Instagram</span>
              </Link>
            </Button>
          </div>
          <div className="text-center">
            <p className="text-muted-foreground text-xs">
              © {currentYear} {dict.copyright}
            </p>
            <p className="mt-4 text-muted-foreground text-sm">
              <Link
                className="hover:text-primary hover:underline"
                href={`/${lang}/tools/audio-converter`}
              >
                {dict.audioConverter}
              </Link>
              {' - '}
              <a
                className="hover:text-primary hover:underline"
                href="https://sexyvoice.checkly-dashboards.com/"
                rel="noreferrer"
                target="_blank"
              >
                {dict.statusPage}
              </a>
              {' - '}
              <Link
                className="whitespace-nowrap hover:text-primary hover:underline"
                href={`/${lang}/privacy-policy`}
              >
                {dict.privacyPolicy}
              </Link>
              {' - '}
              <Link
                className="whitespace-nowrap hover:text-primary hover:underline"
                href={`/${lang}/terms`}
              >
                {dict.termsAndConditions}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
