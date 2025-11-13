// import { Input } from '@/components/ui/input';
// import { Label } from '@/components/ui/label';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Locale } from '@/lib/i18n/i18n-config';

async function Footer({ lang }: { lang: Locale }) {
  const dict = await getDictionary(lang);
  const currentYear = new Date().getFullYear();
  return (
    <footer className="bg-gray-900 py-12">
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex flex-col items-center">
          {/* <div className="mb-8 rounded-full bg-primary/10 p-8">
            <Icons.logo className="icon-class w-6" />
          </div> */}
          {/* <nav className="mb-8 flex flex-wrap justify-center gap-6">
            <a href="#" className="hover:text-primary">
              Home
            </a>
            <a href="#" className="hover:text-primary">
              About
            </a>
            <a href="#" className="hover:text-primary">
              Blog
            </a>
          </nav> */}
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
          </div>
          {/* <div className="mb-8 w-full max-w-md">
            <form className="flex space-x-2">
              <div className="grow">
                <Label htmlFor="email" className="sr-only">
                  Email
                </Label>
                <Input
                  id="email"
                  placeholder="Enter your email"
                  type="email"
                  className="rounded-full"
                />
              </div>
              <Button type="submit" className="rounded-full">
                Subscribe
              </Button>
            </form>
          </div> */}
          <div className="text-center">
            <p className="text-muted-foreground text-xs">
              © {currentYear} {dict.footer.copyright}
            </p>
            <p className="mt-4 text-muted-foreground text-sm">
              <a
                className="hover:text-primary hover:underline"
                href="https://sexyvoice.checkly-dashboards.com/"
                rel="noreferrer"
                target="_blank"
              >
                {dict.footer.statusPage}
              </a>
              {' - '}
              <a
                className="hover:text-primary hover:underline"
                href="/privacy-policy"
                rel="noreferrer"
              >
                {dict.footer.privacyPolicy}
              </a>
              {' - '}
              <a
                className="hover:text-primary hover:underline"
                href="/terms"
                rel="noreferrer"
              >
                {dict.footer.termsAndConditions}
              </a>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
