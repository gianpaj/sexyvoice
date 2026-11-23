'use client';

import { ExternalLink, Megaphone } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import type { ComponentProps } from 'react';

import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { type ChangelogChangeType, changelogReleases } from '@/data/changelog';

const RELEASES_URL = 'https://github.com/gianpaj/sexyvoice/releases';
const pullRequestUrl = (pr: number) =>
  `https://github.com/gianpaj/sexyvoice/pull/${pr}`;

const CHANGE_TYPE_BADGE_VARIANTS: Record<
  ChangelogChangeType,
  ComponentProps<typeof Badge>['variant']
> = {
  added: 'default',
  changed: 'secondary',
  fixed: 'outline',
};

const CHANGE_TYPE_MESSAGE_KEYS = {
  added: 'changelogAdded',
  changed: 'changelogChanged',
  fixed: 'changelogFixed',
} as const;

const DATE_FORMAT = {
  dateStyle: 'medium',
} as const;

export function ChangelogMenu() {
  const t = useTranslations('sidebar');
  const format = useFormatter();

  return (
    <Sheet>
      <SidebarMenu>
        <SidebarMenuItem>
          <SheetTrigger asChild>
            {/* No `tooltip` prop here: it wraps the button in a Tooltip,
                which would swallow the trigger's injected props. */}
            <SidebarMenuButton>
              <Megaphone />
              {t('changelog')}
            </SidebarMenuButton>
          </SheetTrigger>
        </SidebarMenuItem>
      </SidebarMenu>
      <SheetContent className="w-10/12 gap-0 sm:max-w-md" side="left">
        <SheetHeader>
          <SheetTitle>{t('changelog')}</SheetTitle>
          <SheetDescription>{t('changelogDescription')}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          <div className="flex flex-col gap-6 pb-4">
            {changelogReleases.map((release) => (
              <section className="flex flex-col gap-3" key={release.version}>
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-semibold text-sm">{release.version}</h3>
                  <time
                    className="shrink-0 text-muted-foreground text-xs"
                    dateTime={release.date}
                  >
                    {format.dateTime(
                      new Date(`${release.date}T00:00:00`),
                      DATE_FORMAT,
                    )}
                  </time>
                </div>
                <ul className="flex flex-col gap-3">
                  {release.entries.map((entry) => (
                    <li className="flex flex-col gap-1" key={entry.text}>
                      <div className="flex items-center gap-1.5">
                        <Badge variant={CHANGE_TYPE_BADGE_VARIANTS[entry.type]}>
                          {t(CHANGE_TYPE_MESSAGE_KEYS[entry.type])}
                        </Badge>
                        <span className="text-muted-foreground text-xs">
                          {entry.area}
                        </span>
                        {entry.prs?.map((pr) => (
                          <Link
                            className="text-muted-foreground text-xs hover:underline"
                            href={pullRequestUrl(pr)}
                            key={pr}
                            target="_blank"
                          >
                            #{pr}
                          </Link>
                        ))}
                      </div>
                      <p className="text-muted-foreground text-sm leading-relaxed">
                        {entry.text}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
        <SheetFooter className="border-t">
          <Link
            className="inline-flex items-center gap-1 font-medium text-sm hover:underline"
            href={RELEASES_URL}
            target="_blank"
          >
            {t('changelogViewAll')}
            <ExternalLink className="size-3.5" />
          </Link>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
