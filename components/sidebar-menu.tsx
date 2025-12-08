'use client';

import { ChevronUp, User2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useContext } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarContext,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenu as SidebarMenuUI,
} from '@/components/ui/sidebar';
import type langDict from '@/lib/i18n/dictionaries/en.json';
import type { Locale } from '@/lib/i18n/i18n-config';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export function SidebarMenu({
  lang,
  dict,
}: {
  lang: Locale;
  dict: (typeof langDict)['sidebar'];
}) {
  // Safely access the sidebar context without throwing an error
  const sidebarContext = useContext(SidebarContext);
  const isMobile = sidebarContext?.isMobile;
  const toggleSidebar = sidebarContext?.toggleSidebar;

  const supabase = getSupabaseBrowserClient();
  const router = useRouter();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push(`/${lang}`);
  };

  return (
    <SidebarMenuUI>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton>
              <User2 /> {dict.profile}
              <ChevronUp className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-popper-anchor-width]"
            side="top"
          >
            <DropdownMenuItem asChild>
              <Link
                href={`/${lang}/dashboard/profile`}
                onClick={() => {
                  if (isMobile) {
                    toggleSidebar?.();
                  }
                }}
              >
                {dict.profile}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleSignOut}>
              <span>{dict.signOut}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenuUI>
  );
}
