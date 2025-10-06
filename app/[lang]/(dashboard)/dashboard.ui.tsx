'use client';

import type { User } from '@supabase/supabase-js';
import { Crisp } from 'crisp-sdk-web';
import { CreditCard, FileClock, Mic2, Wand2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePostHog } from 'posthog-js/react';
import { useEffect, useState } from 'react';

import logoSmall from '@/app/assets/S-logo-transparent-small.png';
import CreditsSection from '@/components/credits-section';
import { HalloweenBanner } from '@/components/halloween-banner';
import { PostHogProvider } from '@/components/PostHogProvider';
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
import { createClient } from '@/lib/supabase/client';

interface DashboardUIProps {
  children: React.ReactNode;
  lang: Locale;
  dict: (typeof langDict)['creditsSection'];
  halloweenDict: (typeof langDict)['halloween'];
}

export default function DashboardUI({
  children,
  lang,
  dict,
  halloweenDict,
}: DashboardUIProps) {
  const pathname = usePathname();
  const supabase = createClient();

  const [credit_transactions, setCreditTransactions] = useState<
    CreditTransaction[] | null
  >([]);
  const [credits, setCredits] = useState<Pick<Credit, 'amount'> | null>();

  const posthog = usePostHog();

  // biome-ignore lint/correctness/useExhaustiveDependencies: credits state dependency
  useEffect(() => {
    const getData = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      if (!user) throw new Error('User not found');

      // Get user's credits
      const { data: creditsData } = await supabase
        .from('credits')
        .select('amount')
        .eq('user_id', user?.id)
        .single();
      setCredits(creditsData);
      const { data: credit_transactions } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      setCreditTransactions(credit_transactions);
      return { user, creditsData };
    };

    const sendUserAnalyticsData = async (
      user: User,
      creditsData: Pick<Credit, 'amount'> | null | undefined,
    ) => {
      posthog.identify(user.id, {
        email: user.email,
        name: user.user_metadata.full_name || user.user_metadata.username,
        creditsLeft: creditsData?.amount || 0,
      });
      if (process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID) {
        Crisp.configure(process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID, {
          locale: lang,
        });
        user.email && Crisp.user.setEmail(user.email);
        const nickname =
          user.user_metadata.full_name || user.user_metadata.username;
        if (nickname) {
          Crisp.user.setNickname(nickname);
        }
        Crisp.session.setData({
          user_id: user.id,
          creditsLeft: creditsData?.amount || 0,
          // plan
        });
      }
    };

    getData()
      .then(({ user, creditsData }) => {
        sendUserAnalyticsData(user, creditsData);
      })
      .catch((error) => {
        console.error('Failed to initialize dashboard layout:', error);
      });
  }, []);

  const navigation = [
    {
      name: 'Generate',
      href: `/${lang}/dashboard/generate`,
      icon: Wand2,
      current: pathname === `/${lang}/dashboard/generate`,
    },
    {
      name: 'Clone',
      href: `/${lang}/dashboard/clone`,
      icon: Mic2,
      current: pathname === `/${lang}/dashboard/clone`,
    },
    {
      name: 'History',
      href: `/${lang}/dashboard/history`,
      icon: FileClock,
      current: pathname === `/${lang}/dashboard/history`,
    },
    {
      name: 'Credits',
      href: `/${lang}/dashboard/credits`,
      icon: CreditCard,
      current: pathname === `/${lang}/dashboard/credits`,
    },
  ];

  return (
    <PostHogProvider>
      <div className="bg-background min-h-screen">
        <HalloweenBanner
          text={halloweenDict.banner.text}
          ctaText={halloweenDict.banner.ctaLoggedIn}
          ctaLink={`/${lang}/dashboard/credits`}
          isEnabled={process.env.NEXT_PUBLIC_PROMO_ENABLED === 'true'}
        />
        <SidebarProvider defaultOpen>
          <Sidebar collapsible="icon">
            <SidebarHeader>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[state=expanded]:gap-0 items-end"
                  >
                    <div className="aspect-square group-data-[collapsible=icon]:size-9">
                      <Image
                        src={logoSmall}
                        alt="Logo"
                        width={221 / 8}
                        height={292 / 8}
                      />
                    </div>
                    <span className="text-xl font-semibold">exyVoice.ai</span>
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
                          isActive={item.current}
                          tooltip={item.name}
                          asChild
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
                lang={lang}
                dict={dict}
                credits={credits?.amount || 0}
                credit_transactions={credit_transactions || []}
              />

              <SidebarMenuCustom lang={lang} />
            </SidebarFooter>
          </Sidebar>

          <div className="flex flex-col flex-1 w-full">
            <div className="sticky top-0 z-30 flex h-16 items-center border-b px-4 sm:px-6 lg:hidden bg-background shadow-sm">
              <SidebarTrigger className="lg:hidden" />
            </div>

            <main
              id="main-content"
              className="px-4 py-8 sm:px-6 lg:px-8 flex-1"
            >
              {children}
            </main>
            <footer className="p-4 border-t text-center">
              <p className="text-xs text-gray-500">
                <a
                  href="https://sexyvoice.checkly-dashboards.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  Status Page
                </a>
                <span> - </span>
                <a
                  href="https://sexyvoice.featurebase.app/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  Roadmap
                </a>
              </p>
            </footer>
          </div>
        </SidebarProvider>
      </div>
    </PostHogProvider>
  );
}
