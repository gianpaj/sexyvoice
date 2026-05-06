'use client';

import { ChevronUp, ExternalLink, User2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenu as SidebarMenuUI,
  useSidebar,
} from '@/components/ui/sidebar';
import type { Locale } from '@/lib/i18n/i18n-config';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type langDict from '@/messages/en.json';

export function SidebarMenu({
  lang,
  dict,
}: {
  lang: Locale;
  dict: (typeof langDict)['sidebar'];
}) {
  // Read sidebar state from context; this component must be rendered within SidebarProvider.
  const { isMobile, toggleSidebar } = useSidebar();

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
            className="w-(--radix-popper-anchor-width)"
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
            <DropdownMenuItem asChild>
              <Link href="https://docs.sexyvoice.ai" target="_blank">
                Documentation
                <ExternalLink className="ml-3 size-3" />
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
