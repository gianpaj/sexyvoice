'use client'

import * as React from 'react'
import { signIn } from 'next-auth/react'

import { cn } from '@/lib/utils'
import { Button, type ButtonProps } from '@/components/ui/button'
import { IconGitHub, IconSpinner } from '@/components/ui/icons'

interface LoginButtonProps extends ButtonProps {
  showGithubIcon?: boolean
  text?: string
}

export function LoginButton({
  text = 'Login with GitHub',
  showGithubIcon = true,
  className,
  variant,
  ...props
}: Readonly<LoginButtonProps>) {
  const [isLoading, setIsLoading] = React.useState(false)

  const githubIcon = showGithubIcon ? <IconGitHub className="mr-2" /> : null

  return (
    <Button
      variant="outline"
      onClick={() => {
        setIsLoading(true)
        // next-auth signIn() function doesn't work yet at Edge Runtime due to usage of BroadcastChannel
        signIn('github', { callbackUrl: `/` })
      }}
      disabled={isLoading}
      className={cn(
        `${className} max-w-[16rem] dark:bg-white bg-black text-secondary`
      )}
      {...props}
    >
      {isLoading ? <IconSpinner className="mr-2 animate-spin" /> : githubIcon}

      {text}
    </Button>
  )
}
