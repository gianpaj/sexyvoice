import { ArrowUpRight, type LucideIcon } from 'lucide-react';
import Link from 'next/link';

import { cn } from '@/lib/utils';

interface FeatureCardProps {
  href: string;
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
  className?: string;
  external?: boolean;
}

export function FeatureCard({
  href,
  icon: Icon,
  title,
  children,
  className,
  external = false,
}: FeatureCardProps) {
  return (
    <Link
      className={cn(
        'group relative my-2 block w-full cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-card font-normal ring-2 ring-transparent transition-colors hover:border-primary',
        className,
      )}
      href={href}
      rel={external ? 'noopener noreferrer' : undefined}
      target={external ? '_blank' : undefined}
    >
      <div className="relative px-6 py-5">
        {/* Arrow icon — visible on hover */}
        <ArrowUpRight className="absolute top-5 right-5 size-4 text-zinc-500 opacity-0 transition-opacity group-hover:opacity-100" />

        {/* Lucide icon */}
        <Icon className="size-6 text-zinc-100 transition-colors" />

        {/* Title */}
        <h3 className="mt-4 font-semibold text-base text-white">
          {title}
        </h3>

        {/* Description */}
        <p className="mt-1 font-normal text-base text-zinc-400 leading-6">
          {children}
        </p>
      </div>
    </Link>
  );
}
