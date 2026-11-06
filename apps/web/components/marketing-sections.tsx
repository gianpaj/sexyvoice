import { Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Link } from '@/lib/i18n/navigation';
import { splitHeroTitle } from '@/lib/text';

/** A headline whose part after the first comma shows in the brand gradient. */
export function HeroTitle({
  className,
  title,
}: {
  className: string;
  title: string;
}) {
  const [first, rest] = splitHeroTitle(title);
  return (
    <h1 className={className}>
      <span className="text-white/90">{first}</span>
      {rest && (
        <>
          <br />
          <span
            className="whitespace-break-spaces bg-linear-to-r bg-clip-text text-transparent"
            style={{
              backgroundImage:
                'linear-gradient(146deg, hsl(var(--brand-purple)) 0%, hsl(var(--brand-red)) 80%)',
            }}
          >
            {rest}
          </span>
        </>
      )}
    </h1>
  );
}

/** The free-credits signup prompt that closes the marketing pages. */
export function CtaSection({
  cta,
}: {
  cta: { action: string; freeCredits: string; subtitle: string; title: string };
}) {
  return (
    <div className="space-y-8 py-16 text-center">
      <div className="mb-4 inline-flex items-center rounded-full bg-blue-600/20 px-4 py-2 text-blue-400">
        <Sparkles className="mr-2 size-4" />
        <span>{cta.freeCredits}</span>
      </div>
      <h2 className="text-balance font-bold text-3xl text-white md:text-4xl">
        {cta.title}
      </h2>
      <p className="mx-auto max-w-2xl text-pretty text-gray-300 text-xl">
        {cta.subtitle}
      </p>
      <Button
        asChild
        className="hit-area-4 mt-4 bg-blue-600 hover:bg-blue-700"
        effect="ringHover"
        size="lg"
      >
        <Link href="/signup">{cta.action}</Link>
      </Button>
    </div>
  );
}
