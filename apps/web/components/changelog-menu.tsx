'use client';

import { ExternalLink, Megaphone } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useMessages, useTranslations } from 'next-intl';
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  use,
  useState,
} from 'react';

import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import {
  type ChangelogChangeType,
  changelogReleases,
  parseChangelogDate,
} from '@/data/changelog';

const RELEASES_URL = 'https://www.notion.com/releases';
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

// Release dates are calendar days, not instants: `parseChangelogDate` anchors
// them to UTC midnight and `timeZone: 'UTC'` formats them there, so the
// rendered day never shifts with the user's or server's time zone.
const DATE_FORMAT = {
  dateStyle: 'medium',
  timeZone: 'UTC',
} as const;

const OpenChangelogContext = createContext<(() => void) | null>(null);

export function ChangelogMenu() {
  const t = useTranslations('sidebar');
  const openChangelog = use(OpenChangelogContext);
  if (!openChangelog) {
    throw new Error('ChangelogMenu must be used within ChangelogSheet.');
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        {/* `SidebarMenuButton` also closes the mobile sidebar on click, which
            is what we want: the sheet below is mounted outside the sidebar,
            so it stays open after the sidebar unmounts. */}
        <SidebarMenuButton onClick={openChangelog}>
          <Megaphone />
          {t('changelog')}
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

/**
 * Wraps the dashboard layout so the changelog sheet mounts outside `Sidebar`.
 * On mobile the sidebar is itself a Sheet whose content unmounts on close, so
 * a sheet nested inside it would close as soon as the sidebar does.
 */
export function ChangelogSheet({ children }: { children: ReactNode }) {
  const t = useTranslations('sidebar');
  const format = useFormatter();
  const messages = useMessages();
  const [open, setOpen] = useState(false);
  const localizedReleases = messages.sidebar.changelogReleases;

  return (
    <OpenChangelogContext.Provider value={() => setOpen(true)}>
      <Sheet onOpenChange={setOpen} open={open}>
        {children}
        <SheetContent className="w-10/12 gap-0 sm:max-w-md" side="left">
          <SheetHeader>
            <SheetTitle>{t('changelog')}</SheetTitle>
            <SheetDescription>{t('changelogDescription')}</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4">
            <div className="flex flex-col gap-6 pb-4">
              {changelogReleases.map((release, releaseIndex) => {
                const releaseDate = parseChangelogDate(release.date);
                const localizedEntries =
                  localizedReleases[releaseIndex]?.entries;
                return (
                  <section
                    className="flex flex-col gap-3"
                    key={release.version}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="font-semibold text-sm">
                        {release.version}
                      </h3>
                      <time
                        className="shrink-0 text-muted-foreground text-xs"
                        dateTime={release.date}
                      >
                        {releaseDate
                          ? format.dateTime(releaseDate, DATE_FORMAT)
                          : release.date}
                      </time>
                    </div>
                    <ul className="flex flex-col gap-3">
                      {release.entries.map((entry, entryIndex) => {
                        const localized = localizedEntries?.[entryIndex];
                        return (
                          <li className="flex flex-col gap-1" key={entryIndex}>
                            <div className="flex items-center gap-1.5">
                              <Badge
                                variant={CHANGE_TYPE_BADGE_VARIANTS[entry.type]}
                              >
                                {t(CHANGE_TYPE_MESSAGE_KEYS[entry.type])}
                              </Badge>
                              <span className="text-muted-foreground text-xs">
                                {localized?.area}
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
                              {localized?.text}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
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
    </OpenChangelogContext.Provider>
  );
}
