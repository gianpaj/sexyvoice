import { cn } from '@/lib/utils'
import React from 'react'
import { ExternalLink } from './external-link'

export function Footer({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      className={cn(
        'grid grid-flow-col gap-2 px-2 text-center text-xs leading-normal text-muted-foreground ',
        className
      )}
      {...props}
    >
      <ExternalLink href="https://www.reddit.com/r/sexyvoice/">
        Reddit
      </ExternalLink>
      <br />
      <ExternalLink href="mailto:info@sexyvoice.ai">Email</ExternalLink>
      <ExternalLink href="https://sexyvoice.featurebase.app">
        Roadmap
      </ExternalLink>
    </p>
  )
}
