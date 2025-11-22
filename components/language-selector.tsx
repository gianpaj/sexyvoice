import { Languages } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const languages = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
];

export function LanguageSelector({
  currentLang,
  isMobile,
}: {
  currentLang: string;
  isMobile: boolean;
}) {
  const currentLanguage =
    languages.find((lang) => lang.code === currentLang)?.label || 'Language';

  return (
    <DropdownMenu>
      {isMobile ? (
        <>
          <DropdownMenuTrigger asChild>
            <Button
              className="w-36 justify-start p-2 font-normal text-small"
              variant="ghost"
            >
              Language <div>&nbsp;</div> <Languages className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            alignOffset={-5}
            className=""
            side="right"
          >
            {languages.map((lang) => (
              <DropdownMenuItem asChild key={lang.code}>
                <Link
                  className={`w-full cursor-pointer ${currentLang === lang.code ? 'font-bold' : ''}`}
                  href={`/${lang.code}`}
                >
                  {lang.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </>
      ) : (
        <>
          <DropdownMenuTrigger asChild>
            <Button
              className="justify-start bg-secondary/70 p-2 font-normal"
              variant="ghost"
            >
              Language <div>&nbsp;</div> <Languages className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {languages.map((lang) => (
              <DropdownMenuItem asChild key={lang.code}>
                <Link
                  className={`w-full cursor-pointer ${currentLang === lang.code ? 'font-bold' : ''}`}
                  href={`/${lang.code}`}
                >
                  {lang.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </>
      )}
    </DropdownMenu>
  );
}
