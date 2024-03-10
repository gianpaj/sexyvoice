'use client'

import * as React from 'react'
import { signIn } from 'next-auth/react'

import { cn } from '@/lib/utils'
import { Button, type ButtonProps } from '@/components/ui/button'
import { IconGitHub, IconGoogle, IconSpinner } from '@/components/ui/icons'

interface LoginButtonProps extends ButtonProps {
  text: string
  provider: string
}

export function LoginButton({
  text,
  className,
  provider,
  variant,
  ...props
}: Readonly<LoginButtonProps>) {
  const [isLoading, setIsLoading] = React.useState(false)

  let icon = null
  let classes = ''
  switch (provider) {
    case 'github':
      icon = <IconGitHub className="mr-2" />
      classes =
        'bg-[#24292F] hover:bg-[#24292F]/90 focus:ring-[#24292F]/50 dark:focus:ring-gray-500 dark:hover:bg-[#050708]/30'
      break
    case 'google':
      icon = <IconGoogle className="mr-2" />
      classes =
        'bg-[#4285F4] hover:bg-[#4285F4]/90 focus:ring-[#4285F4]/50 dark:focus:ring-[#4285F4]/55'
      break
    default:
      return null
  }

  return (
    <Button
      variant="none"
      onClick={() => {
        setIsLoading(true)
        // next-auth signIn() function doesn't work yet at Edge Runtime due to usage of BroadcastChannel
        signIn(provider, { callbackUrl: `/` })
      }}
      disabled={isLoading}
      className={cn(
        `${className} ${classes} text-white focus:ring-4 focus:outline-none font-medium rounded-lg text-md px-8 py-6 mb-2`
      )}
      {...props}
    >
      {isLoading ? <IconSpinner className="mr-2 animate-spin" /> : icon}
      {text}
    </Button>
  )
}
