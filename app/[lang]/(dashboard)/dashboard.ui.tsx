'use client';

import {
  CreditCard,
  FileClock,
  Mic2,
  PhoneCallIcon,
  Wand2,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import logoSmall from '@/app/assets/S-logo-transparent-small.png';
import CreditsSection from '@/components/credits-section';
import { PromoBanner } from '@/components/promo-banner';
import { SidebarMenu as SidebarMenuCustom } from '@/components/sidebar-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import type langDict from '@/lib/i18n/dictionaries/en.json';
import type { Locale } from '@/lib/i18n/i18n-config';

interface DashboardUIProps {
  children: React.ReactNode;
  creditTransactions: Pick<Tables<'credit_transactions'>, 'amount'>[];
  userId: string;
  lang: Locale;
  dict: typeof langDict;
  promoDict: (typeof langDict)['promos']['blackFridayBanner'];
}

export default function DashboardUI({
  children,
  creditTransactions,
  userId,
  lang,
  dict,
  promoDict,
}: DashboardUIProps) {
  const pathname = usePathname();

  const navigation = [
    {
      name: dict.pages['/dashboard/call'],
      href: `/${lang}/dashboard/call`,
      icon: PhoneCallIcon,
      current: pathname === `/${lang}/dashboard/call`,
    },
    {
      name: dict.pages['/dashboard/generate'],
      href: `/${lang}/dashboard/generate`,
      icon: Wand2,
      current: pathname === `/${lang}/dashboard/generate`,
    },
    {
      name: dict.pages['/dashboard/clone'],
      href: `/${lang}/dashboard/clone`,
      icon: Mic2,
      current: pathname === `/${lang}/dashboard/clone`,
    },
    {
      name: dict.pages['/dashboard/history'],
      href: `/${lang}/dashboard/history`,
      icon: FileClock,
      current: pathname === `/${lang}/dashboard/history`,
    },
    {
      name: dict.pages['/dashboard/credits'],
      href: `/${lang}/dashboard/credits`,
      icon: CreditCard,
      current: pathname === `/${lang}/dashboard/credits`,
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <SidebarProvider defaultOpen>
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="items-end data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[state=expanded]:gap-0"
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
                      <SidebarMenuButton
                        asChild
                        isActive={item.current}
                        tooltip={item.name}
                      >
                        <Link href={item.href}>
                          <item.icon className="mr-3 size-5" />
                          <span>{item.name}</span>
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
              dict={dict.creditsSection}
              lang={lang}
              showMinutes={pathname === `/${lang}/dashboard/call`}
              userId={userId}
            />

            <SidebarMenuCustom dict={dict.sidebar} lang={lang} />
          </SidebarFooter>
        </Sidebar>

        <PromoBanner
          ariaLabelDismiss={promoDict.ariaLabelDismiss}
          countdown={
            process.env.NEXT_PUBLIC_PROMO_COUNTDOWN_END_DATE
              ? {
                  enabled: true,
                  endDate: process.env.NEXT_PUBLIC_PROMO_COUNTDOWN_END_DATE,
                  labels: promoDict.countdown,
                }
              : undefined
          }
          ctaLink={`/${lang}/dashboard/credits`}
          ctaText={promoDict.ctaLoggedIn}
          inDashboard
          isEnabled={process.env.NEXT_PUBLIC_PROMO_ENABLED === 'true'}
          text={promoDict.text}
        />
        <div className="flex w-full flex-1 flex-col">
          <div className="sticky top-0 z-30 flex h-16 items-center border-b bg-background px-4 shadow-sm sm:px-6 lg:hidden">
            <SidebarTrigger className="lg:hidden" />
          </div>

          <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8" id="main-content">
            {children}
          </main>
          <footer className="border-t p-4 text-center">
            <p className="text-gray-500 text-xs">
              <a
                className="hover:underline"
                href="https://sexyvoice.checkly-dashboards.com/"
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
