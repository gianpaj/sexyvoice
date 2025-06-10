import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Header } from './header';

interface AuthPageLayoutProps {
  lang: string;
  children: ReactNode;
  banner?: ReactNode;
  containerClassName?: string;
}

export function AuthPageLayout({
  lang,
  children,
  banner,
  containerClassName,
}: AuthPageLayoutProps) {
  return (
    <>
      <Header lang={lang} />
      <div
        className={cn(
          'flex min-h-[calc(100vh-65px)] sm:min-h-screen sm:pt-0 pt-11 sm:items-center flex-col justify-center dark:bg-gradient-to-br dark:from-gray-900 dark:to-gray-800 p-4',
          containerClassName,
        )}
      >
        {banner}
        <div className="w-full max-w-md">
          <div className="rounded-2xl p-8 bg-background shadow-xl">
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
