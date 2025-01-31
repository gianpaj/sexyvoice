import Link from 'next/link';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Languages } from 'lucide-react';

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
              variant="ghost"
              className="w-36 justify-start p-2 text-small font-normal"
            >
              Language <div>&nbsp;</div> <Languages className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="right"
            align="start"
            alignOffset={-5}
            className=""
          >
            {languages.map((lang) => (
              <DropdownMenuItem key={lang.code} asChild>
                <Link
                  href={`/${lang.code}`}
                  className={`w-full cursor-pointer ${currentLang === lang.code ? 'font-bold' : ''}`}
                >
                  {lang.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </>
      ) : (
        <DropdownMenuContent align="end">
          {languages.map((lang) => (
            <DropdownMenuItem key={lang.code} asChild>
              <Link
                href={`/${lang.code}`}
                className={`w-full cursor-pointer ${currentLang === lang.code ? 'font-bold' : ''}`}
              >
                {lang.label}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      )}
    </DropdownMenu>
  );
}
