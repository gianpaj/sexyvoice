'use client';

import {
  BarChart3,
  CreditCard,
  ExternalLink,
  FileAudio,
  FileClock,
  FileText,
  KeyRound,
  Mic2,
  PhoneIcon,
  ReceiptText,
  Scissors,
  Wand2,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type MouseEvent, useState } from 'react';

import logoSmall from '@/app/assets/s-logo-small.svg';
import { Banner } from '@/components/banner';
import CreditsSection from '@/components/credits-section';
import { DashboardAnalytics } from '@/components/dashboard-analytics';
import {
  MobileNavigationPending,
  SidebarLinkPending,
} from '@/components/navigation-pending';
import { SidebarFooterMenu } from '@/components/sidebar-footer-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { useIsMobile } from '@/hooks/use-mobile';
import type { ResolvedBanner } from '@/lib/banners/types';
import type { Locale } from '@/lib/i18n/i18n-config';

interface DashboardUIProps {
  activeBanner: ResolvedBanner | null;
  children: React.ReactNode;
  creditTransactions: Pick<Tables<'credit_transactions'>, 'amount'>[];
  isPaidUser: boolean;
  lang: Locale;
  userId: string;
}

export default function DashboardUI({
  activeBanner,
  children,
  creditTransactions,
  isPaidUser,
  userId,
  lang,
}: DashboardUIProps) {
  const pathname = usePathname();
  const t = useTranslations('pages');
  const tSidebar = useTranslations('sidebar');
  const isMobile = useIsMobile();
  // The page a phone sidebar click navigates away from. It resets once the
  // pathname changes, including on browser back and forward.
  const [mobileNavigationFrom, setMobileNavigationFrom] = useState<
    string | null
  >(null);
  if (mobileNavigationFrom !== null && mobileNavigationFrom !== pathname) {
    setMobileNavigationFrom(null);
  }

  const handleNavigationClick = (event: MouseEvent, href: string) => {
    const opensElsewhere =
      event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    if (isMobile && href !== pathname && !opensElsewhere) {
      setMobileNavigationFrom(pathname);
    }
  };

  const navigation = [
    {
      current: pathname === `/${lang}/dashboard/generate`,
      href: `/${lang}/dashboard/generate`,
      icon: Wand2,
      name: t('/dashboard/generate'),
    },
    {
      current: pathname === `/${lang}/dashboard/clone`,
      href: `/${lang}/dashboard/clone`,
      icon: Mic2,
      name: t('/dashboard/clone'),
    },
    {
      current: pathname === `/${lang}/dashboard/call`,
      href: `/${lang}/dashboard/call`,
      icon: PhoneIcon,
      name: t('/dashboard/call'),
    },
    {
      current: pathname === `/${lang}/dashboard/credits`,
      href: `/${lang}/dashboard/credits`,
      icon: CreditCard,
      name: t('/dashboard/credits'),
    },
    {
      current: pathname === `/${lang}/dashboard/history`,
      href: `/${lang}/dashboard/history`,
      icon: FileClock,
      name: t('/dashboard/history'),
    },
    {
      current: pathname === `/${lang}/dashboard/usage`,
      href: `/${lang}/dashboard/usage`,
      icon: BarChart3,
      name: t('/dashboard/usage'),
    },
    {
      current: pathname === `/${lang}/dashboard/api-keys`,
      href: `/${lang}/dashboard/api-keys`,
      icon: KeyRound,
      name: t('/dashboard/api-keys'),
    },
    ...(isPaidUser
      ? [
          {
            current: pathname === `/${lang}/dashboard/api-billing`,
            href: `/${lang}/dashboard/api-billing`,
            icon: ReceiptText,
            name: t('/dashboard/api-billing'),
          },
        ]
      : []),
  ];

  const freeTools = [
    {
      href: `/${lang}/tools/audio-converter`,
      icon: FileAudio,
      name: t('/tools/audio-converter'),
    },
    {
      href: `/${lang}/tools/transcribe`,
      icon: FileText,
      name: t('/tools/transcribe'),
    },
    {
      href: `/${lang}/tools/audio-joiner`,
      icon: Scissors,
      name: t('/tools/audio-joiner'),
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <SidebarProvider defaultOpen>
        <DashboardAnalytics lang={lang} userId={userId} />
        <MobileNavigationPending pending={mobileNavigationFrom !== null} />
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="items-end data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[state=expanded]:gap-0"
                  data-visual-test="transparent"
                  size="lg"
                >
                  <div className="aspect-square group-data-[collapsible=icon]:size-9">
                    <Image
                      alt="Logo"
                      height={292 / 8}
                      src={logoSmall}
                      width={221 / 8}
                    />
                  </div>
                  <span className="font-semibold text-xl">exyVoice.ai</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navigation.map((item) => (
                    <SidebarMenuItem key={item.name}>
                      <SidebarMenuButton asChild isActive={item.current}>
                        <Link
                          href={item.href}
                          onClick={(event) =>
                            handleNavigationClick(event, item.href)
                          }
                        >
                          <item.icon className="mr-3 size-5" />
                          <span className="truncate">{item.name}</span>
                          <SidebarLinkPending />
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>{tSidebar('freeTools')}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {freeTools.map((item) => (
                    <SidebarMenuItem key={item.name}>
                      <SidebarMenuButton asChild>
                        <Link href={item.href} target="_blank">
                          <item.icon className="mr-3 size-5" />
                          <span>{item.name}</span>
                          <ExternalLink className="max-h-3 max-w-3" />
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter>
            <CreditsSection
              creditTransactions={creditTransactions}
              showMinutes={pathname === `/${lang}/dashboard/call`}
              userId={userId}
            />
            <SidebarFooterMenu lang={lang} />
          </SidebarFooter>
        </Sidebar>

        <div className="group/dashboard relative flex min-w-0 flex-1 flex-col">
          <div className="sticky top-0 z-30 flex h-12 items-center border-b bg-background px-4 shadow-sm group-has-data-dashboard-banner/dashboard:absolute group-has-[[data-dashboard-banner]]/dashboard:left-0 group-has-[[data-dashboard-banner]]/dashboard:size-11 group-has-[[data-dashboard-banner]]/dashboard:border-0 group-has-[[data-dashboard-banner]]/dashboard:bg-transparent group-has-[[data-dashboard-banner]]/dashboard:px-0 group-has-[[data-dashboard-banner]]/dashboard:shadow-none sm:px-6 lg:hidden">
            <SidebarTrigger className="size-11 lg:hidden" />
          </div>

          {activeBanner && <Banner banner={activeBanner} inDashboard />}

          <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8" id="main-content">
            {children}
          </main>
          <footer className="border-t p-4 text-center">
            <p className="text-gray-500 text-xs">
              <a
                className="hover:underline"
                href="https://status.sexyvoice.ai"
                rel="noopener noreferrer"
                target="_blank"
              >
                Status Page
              </a>
              <span> - </span>
              <a
                className="hover:underline"
                href="https://sexyvoice.featurebase.app/"
                rel="noopener noreferrer"
                target="_blank"
              >
                Roadmap
              </a>
            </p>
          </footer>
        </div>
      </SidebarProvider>
    </div>
  );
}
