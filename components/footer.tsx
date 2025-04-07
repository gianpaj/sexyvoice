// import { Input } from '@/components/ui/input';
// import { Label } from '@/components/ui/label';
import { Icon } from '@iconify/react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

function Footer() {
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
                <Icon icon="logos:x" width="256" height="262" fill="white" />
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
            <p className="text-sm text-muted-foreground">
              © 2025 SexyVoice.ai. All rights reserved.
            </p>
            <p className="text-sm text-muted-foreground mt-4">
              <a
                href="https://sexyvoice.checkly-dashboards.com/"
                className="hover:text-primary hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                Status page
              </a>{' '}
              <a
                href="/privacy-policy"
                className="hover:text-primary hover:underline"
                rel="noreferrer"
              >
                Privacy Policy
              </a>
              <a
                href="/terms"
                className="hover:text-primary hover:underline"
                rel="noreferrer"
              >
                Terms and Conditions
              </a>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
