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
        'group relative my-2 block w-full cursor-pointer overflow-hidden rounded-2xl border font-normal ring-2 ring-transparent transition-colors border-white/10 bg-card hover:border-primary',
        className,
      )}
      href={href}
      rel={external ? 'noopener noreferrer' : undefined}
      target={external ? '_blank' : undefined}
    >
      <div className="relative px-6 py-5">
        {/* Arrow icon — visible on hover */}
        <ArrowUpRight className="absolute right-5 top-5 h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100 text-gray-500" />

        {/* Lucide icon */}
        <Icon className="h-6 w-6 transition-colors  text-gray-100" />

        {/* Title */}
        <h3 className="mt-4 text-base font-semibold text-gray-800 text-white">
          {title}
        </h3>

        {/* Description */}
        <p className="mt-1 text-base font-normal leading-6 text-gray-400">
          {children}
        </p>
      </div>
    </Link>
  );
}
