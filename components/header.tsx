// 'use client'

import { useState, Suspense } from 'react'
import Link from 'next/link'
import Image from 'next/image'

import { auth } from '@/auth'
import { Button } from '@/components/ui/button'
import { IconSeparator } from '@/components/ui/icons'
import { UserMenu } from '@/components/user-menu'
import { SidebarMobile } from '@/components/sidebar-mobile'
import { SidebarToggle } from '@/components/sidebar-toggle'
import { ChatHistory } from '@/components/chat-history'
import { ThemeToggle } from './theme-toggle'

async function UserOrLogin() {
  // const { data: session } = useSession()
  const session = await auth()
  // const [isSidebarOpened, setSidebar] = useState(false)
  return (
    <>
      {session?.user ? (
        <>
          <SidebarMobile>
            <ChatHistory userId={session.user.id} />
          </SidebarMobile>
          <SidebarToggle />
        </>
      ) : (
        <>
          <SidebarMobile>
            <ChatHistory />
          </SidebarMobile>
          <Link href="/" target="_blank" rel="nofollow">
            <Image
              src="/favicon-32x32.png"
              alt="SexyVoice.ai"
              className="size-4"
              width={16}
              height={16}
              priority
            />
          </Link>
        </>
      )}
      <div className="flex items-center">
        <IconSeparator className="size-6 text-muted-foreground/50" />
        {session?.user ? (
          <UserMenu user={session.user} />
        ) : (
          <Button variant="link" asChild className="-ml-2">
            <Link href="/sign-in?callbackUrl=/">SexyVoice.ai - Login</Link>
          </Button>
        )}
        <div className="flex justify-self-end">
          <ThemeToggle />
        </div>
      </div>
    </>
  )
}

export function Header() {
  return (
    <header className="sticky top-0 z-50 flex items-center justify-between w-full h-16 px-4 border-b shrink-0 bg-gradient-to-b from-background/10 via-background/50 to-background/80 backdrop-blur-xl">
      <div className="flex items-center">
        <Suspense fallback={<div className="flex-1 overflow-auto" />}>
          <UserOrLogin />
        </Suspense>
      </div>
      {/* <div className="flex items-center justify-end space-x-2">
        <a
          target="_blank"
          href="https://github.com/vercel/nextjs-ai-chatbot/"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: 'outline' }))}
        >
          <IconGitHub />
          <span className="hidden ml-2 md:flex">GitHub</span>
        </a>
      </div> */}
    </header>
  )
}
