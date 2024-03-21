import { cn } from '@/lib/utils'
import React from 'react'
import { ExternalLink } from './external-link'

export function Footer({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      className={cn(
        'px-2 grid grid-flow-col gap-2 text-center text-xs leading-normal text-muted-foreground ',
        className
      )}
      {...props}
    >
      <ExternalLink href="https://www.reddit.com/r/sexyvoice/">
        Reddit
      </ExternalLink>
      <br />
      <ExternalLink href="https://www.instagram.com/sexyvoice.ai">
        Instagram
      </ExternalLink>
      <ExternalLink href="mailto:info@sexyvoice.ai">Email</ExternalLink>
      <ExternalLink href="https://sexyvoice.featurebase.app">
        Roadmap
      </ExternalLink>
    </p>
  )
}
