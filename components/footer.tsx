import React from 'react'

export function FooterText({ className, ...props }: React.ComponentProps<'p'>) {
  return null
  // return (
  //   <p
  //     className={cn(
  //       'px-2 text-center text-xs leading-normal text-muted-foreground',
  //       className
  //     )}
  //     {...props}
  //   >
  //     Open source AI chatbot built with{' '}
  //     <ExternalLink href="https://nextjs.org">Next.js</ExternalLink> and{' '}
  //     <ExternalLink href="https://vercel.com/storage/kv">
  //       Vercel KV
  //     </ExternalLink>
  //     .
  //   </p>
  // )
}
