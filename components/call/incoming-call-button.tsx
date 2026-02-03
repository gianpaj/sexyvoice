import { PhoneCall } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface IncomingCallButtonProps {
  animated?: boolean;
  lang: string;
}

export function IncomingCallButton({
  animated = true,
  lang,
}: IncomingCallButtonProps) {
  return (
    <Button
      asChild
      className={cn(
        'relative h-16 w-16 rounded-full bg-green-500/70 text-white hover:bg-green-600/70',
        animated && 'animate-incoming-call hover:animate-none',
      )}
      size="icon"
    >
      <Link href={`/${lang}/signup`}>
        <PhoneCall className="!h-6 !w-6" />
      </Link>
    </Button>
  );
}
