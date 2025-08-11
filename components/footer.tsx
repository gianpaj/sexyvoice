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
              variant="outline"
              size="icon"
              className="rounded-full bg-gray-900"
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
            <p className="text-xs text-muted-foreground">
              © {currentYear} {dict.footer.copyright}
            </p>
            <p className="text-sm text-muted-foreground mt-4">
              <a
                href="https://sexyvoice.checkly-dashboards.com/"
                className="hover:text-primary hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                {dict.footer.statusPage}
              </a>
              {' - '}
              <a
                href="/privacy-policy"
                className="hover:text-primary hover:underline"
                rel="noreferrer"
              >
                {dict.footer.privacyPolicy}
              </a>
              {' - '}
              <a
                href="/terms"
                className="hover:text-primary hover:underline"
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
