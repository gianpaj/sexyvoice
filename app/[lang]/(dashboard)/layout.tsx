'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/supabase';
import {
  LogOut,
  Menu,
  X,
  Mic2,
  CreditCard,
  User,
  BarChart3,
  Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function DashboardLayout({
  children,
  params: { lang },
}: {
  children: React.ReactNode;
  params: { lang: string };
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const supabase = createClient();
  const router = useRouter();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push(`/${lang}`);
  };

  const navigation = [
    {
      name: 'Dashboard',
      href: `/${lang}/dashboard`,
      icon: BarChart3,
      current: pathname === `/${lang}/dashboard`,
    },
    {
      name: 'Generate',
      href: `/${lang}/dashboard/generate`,
      icon: Wand2,
      current: pathname === `/${lang}/dashboard/generate`,
    },
    {
      name: 'Voices',
      href: `/${lang}/dashboard/voices`,
      icon: Mic2,
      current: pathname === `/${lang}/dashboard/voices`,
    },
    {
      name: 'Credits',
      href: `/${lang}/dashboard/credits`,
      icon: CreditCard,
      current: pathname === `/${lang}/dashboard/credits`,
    },
    {
      name: 'Profile',
      href: `/${lang}/dashboard/profile`,
      icon: User,
      current: pathname === `/${lang}/dashboard/profile`,
    },
  ];

  return (
    <div className="bg-gradient-to-br from-gray-900 to-gray-800">
      {/* Mobile sidebar */}
      <div className="lg:hidden">
        <div
          className="fixed inset-0 z-40 bg-gray-900/80"
          aria-hidden="true"
          style={{ display: sidebarOpen ? 'block' : 'none' }}
        />

        <div
          className={cn(
            'fixed inset-0 z-40 flex transition-transform duration-300 ease-in-out',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <div className="relative flex w-72 flex-col">
            <div className="flex h-16 items-center justify-between px-6">
              <span className="text-xl font-semibold">SexyVoice.ai</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(false)}
              >
                <X className="size-6" />
              </Button>
            </div>

            <div className="flex-1 space-y-1 p-4">
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'flex items-center rounded-lg px-4 py-3 text-sm font-medium',
                    item.current
                      ? 'bg-gray-200 text-gray-900'
                      : 'text-gray-200 hover:bg-gray-50 hover:text-gray-900',
                  )}
                >
                  <item.icon className="mr-3 size-5" />
                  {item.name}
                </Link>
              ))}
            </div>

            <div className="border-t p-4">
              <Button
                variant="ghost"
                className="w-full justify-start text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={handleSignOut}
              >
                <LogOut className="mr-3 size-5" />
                Sign out
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-72 lg:flex-col">
        <div className="flex grow flex-col border-r">
          <div className="flex h-16 items-center px-6">
            <span className="text-xl font-semibold">SexyVoice.ai</span>
          </div>

          <div className="flex-1 space-y-1 p-4">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center rounded-lg px-4 py-3 text-sm font-medium',
                  item.current
                    ? 'bg-gray-200 text-gray-900'
                    : 'text-gray-200 hover:bg-gray-50 hover:text-gray-900',
                )}
              >
                <item.icon className="mr-3 size-5" />
                {item.name}
              </Link>
            ))}
          </div>

          <div className="border-t p-4">
            <Button
              variant="ghost"
              className="w-full justify-start text-grey-900 hover:bg-grey-50 hover:text-grey-700"
              onClick={handleSignOut}
            >
              <LogOut className="mr-3 size-5" />
              Sign out
            </Button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-72 min-h-screen">
        <div className="sticky top-0 z-30 border-b">
          <div className="flex h-16 items-center gap-x-4 px-4 shadow-sm sm:px-6 lg:px-8">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden"
            >
              <Menu className="size-6" />
            </Button>
          </div>
        </div>

        <main className="px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
