'use client';

import { Crisp } from 'crisp-sdk-web';
import {
  ChevronUp,
  CreditCard,
  FileClock,
  Mic2,
  User2,
  Wand2,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { usePostHog } from 'posthog-js/react';
import { use, useEffect, useState } from 'react';

import logoSmall from '@/app/assets/S-logo-transparent-small.png';
import CreditsSection from '@/components/credits-section';
import { PostHogProvider } from '@/components/PostHogProvider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { createClient } from '@/lib/supabase/client';

export default function DashboardLayout(props: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const params = use(props.params);

  const { lang } = params;

  const pathname = usePathname();
  const supabase = createClient();
  const router = useRouter();
  const [credit_transactions, setCreditTransactions] = useState<
    CreditTransaction[] | null
  >([]);
  const [credits, setCredits] = useState<Pick<Credit, 'amount'> | null>();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push(`/${lang}`);
  };
  const posthog = usePostHog();

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    const getData = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      if (!user) return;

      // Get user's credits
      const { data: credits } = await supabase
        .from('credits')
        .select('amount')
        .eq('user_id', user?.id)
        .single();
      setCredits(credits);
      const { data: credit_transactions } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      setCreditTransactions(credit_transactions);
    };

    const sendUserAnalyticsData = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      if (!user) return;

      posthog.identify(user.id, {
        email: user.email,
        name: user.user_metadata.full_name || user.user_metadata.username,
        creditsLeft: credits?.amount || 0,
      });
      user.email && Crisp.user.setEmail(user.email);
      user.user_metadata.full_name ||
        (user.user_metadata.username &&
          Crisp.user.setNickname(
            user.user_metadata.full_name || user.user_metadata.username,
          ));
      Crisp.session.setData({
        user_id: user.id,
        creditsLeft: credits?.amount || 0,
        // plan
      });
    };

    getData();

    if (process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID) {
      Crisp.configure(process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID, {
        locale: lang,
      });
      sendUserAnalyticsData();
    }
  }, []);

  // const flagEnabled = useFeatureFlagEnabled('clone-voice');
  // console.log({ flagEnabled });

  const navigation = [
    {
      name: 'Generate',
      href: `/${lang}/dashboard/generate`,
      icon: Wand2,
      current: pathname === `/${lang}/dashboard/generate`,
    },
    {
      name: 'History',
      href: `/${lang}/dashboard/history`,
      icon: FileClock,
      current: pathname === `/${lang}/dashboard/history`,
    },
    {
      name: 'Clone',
      href: `/${lang}/dashboard/clone`,
      icon: Mic2,
      current: pathname === `/${lang}/dashboard/clone`,
    },
    // ...(flagEnabled
    //   ? [
    //       {
    //         name: 'Clone',
    //         href: `/${lang}/dashboard/clone`,
    //         icon: Copy,
    //         current: pathname === `/${lang}/dashboard/clone`,
    //       },
    //     ]
    //   : []),
    {
      name: 'Credits',
      href: `/${lang}/dashboard/credits`,
      icon: CreditCard,
      current: pathname === `/${lang}/dashboard/credits`,
    },
  ];

  // const plan = credit_transactions?.findLast((t) => t.type === 'freemium')
  //   ? 'free'
  //   : 'paid';

  return (
    <PostHogProvider>
      <div className="bg-background min-h-screen">
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
                    {/* <div className="flex h-16 items-center px-6"> */}
                    <span className="text-xl font-semibold">exyVoice.ai</span>
                    {/* </div> */}
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
                credits={credits?.amount || 0}
                credit_transactions={credit_transactions || []}
              />
              {/* <Button
                variant="ghost"
                className="w-full justify-start text-gray-200 hover:bg-gray-50 hover:text-gray-900"
                onClick={handleSignOut}
              >
                <LogOut className="mr-3 size-5" />
                Sign out
              </Button> */}

              <SidebarMenu>
                <SidebarMenuItem>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuButton>
                        <User2 /> Profile
                        <ChevronUp className="ml-auto" />
                      </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      side="top"
                      className="w-[--radix-popper-anchor-width]"
                    >
                      <DropdownMenuItem asChild>
                        <Link href={`/${lang}/dashboard/profile`}>Profile</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleSignOut}>
                        <span>Sign out</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
              </SidebarMenu>
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
              {props.children}
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
