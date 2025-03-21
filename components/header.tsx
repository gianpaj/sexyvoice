import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
// import { LanguageSelector } from './language-selector';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export async function Header({ lang }: { lang: string }) {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  const user = data?.user;

  return (
    <header className="border-b border-gray-700 bg-gray-900">
      <nav className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link href={`/${lang}`} className="text-xl font-semibold text-white">
          SexyVoice.ai
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-4 justify-center">
          {/* <LanguageSelector currentLang={lang} isMobile={false} /> */}

          {user ? (
            <Link href={`/${lang}/dashboard`}>
              <Button variant="default">Dashboard</Button>
            </Link>
          ) : (
            <div className="space-x-4">
              <Link href={`/${lang}/login`}>
                <Button variant="secondary">Login</Button>
              </Link>
              <Link href={`/${lang}/signup`}>
                <Button variant="default">Sign Up</Button>
              </Link>
            </div>
          )}
        </div>

        {/* Mobile Navigation */}
        <div className="md:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <Menu className="size-5" />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              {/* <LanguageSelector isMobile currentLang={lang} /> */}
              {user ? (
                <DropdownMenuItem asChild>
                  <Link href={`/${lang}/dashboard`} className="w-full">
                    Dashboard
                  </Link>
                </DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem asChild>
                    <Link href={`/${lang}/login`} className="w-full">
                      Login
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`/${lang}/signup`} className="w-full">
                      Sign Up
                    </Link>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>
    </header>
  );
}
