import Image from 'next/image';

import { cn } from '@/lib/utils';

// Initials avatars take a stable color from the character ID, so a card keeps
// its color when the list is reordered or filtered.
const AVATAR_COLORS = [
  'bg-violet-950 text-violet-200',
  'bg-teal-950 text-teal-300',
  'bg-amber-950 text-amber-300',
  'bg-pink-950 text-pink-300',
  'bg-blue-950 text-blue-300',
  'bg-green-950 text-green-300',
];

export function avatarColorClass(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) % 1_000_003;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

const SIZES = {
  sm: { box: 'size-11', text: 'text-lg', px: 44 },
  md: { box: 'size-14', text: 'text-[22px]', px: 56 },
  lg: { box: 'size-[72px]', text: 'text-[28px]', px: 72 },
  xl: { box: 'size-[88px]', text: 'text-[34px]', px: 88 },
  '2xl': { box: 'size-24', text: 'text-4xl', px: 96 },
  '3xl': { box: 'size-36', text: 'text-[52px]', px: 144 },
} as const;

export function CharacterAvatar({
  name,
  image,
  seed,
  size = 'md',
  className,
}: {
  name: string;
  /** File name under `/characters/`. */
  image?: string;
  /** Picks the initials color; defaults to the name. */
  seed?: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const s = SIZES[size];
  if (image) {
    return (
      <span
        className={cn(
          'relative block shrink-0 overflow-hidden rounded-full bg-slate-800',
          s.box,
          className,
        )}
      >
        <Image
          alt=""
          className="object-cover"
          fill
          sizes={`${s.px}px`}
          src={`/characters/${image}`}
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 select-none items-center justify-center rounded-full font-bold',
        s.box,
        s.text,
        avatarColorClass(seed ?? name),
        className,
      )}
    >
      {(name.trim().charAt(0) || '?').toUpperCase()}
    </span>
  );
}
