'use client';

import Image from 'next/image';

interface DemoCharacterAvatarProps {
  accentGradient: string;
  energy: number;
  glowColor: string;
  image: string;
  isSpeaking: boolean;
  name: string;
}

/**
 * Animated avatar with energy-driven speaking pulse ring and glow effect.
 *
 * When `isSpeaking` is true:
 * - Glow effect: box-shadow spread and opacity scaled by energy, using accent color.
 *
 * When not speaking: static ring, no glow.
 * Uses CSS `transition` (not `animation`) for smooth entry/exit.
 */
export function DemoCharacterAvatar({
  image,
  name,
  isSpeaking,
  energy,
  accentGradient,
  glowColor,
}: DemoCharacterAvatarProps) {
  // Clamp energy to 0–1
  const e = Math.max(0, Math.min(1, energy));

  const glowOpacity = isSpeaking ? 0.3 + e * 0.5 : 0;
  const glowSpread = isSpeaking ? 4 + Math.round(e * 16) : 0;

  return (
    <div className="relative flex flex-col items-center gap-2">
      <div
        className={`relative rounded-full bg-linear-to-tr ${accentGradient} p-[3px]`}
        style={{
          boxShadow: isSpeaking
            ? `0 0 ${glowSpread}px ${glowSpread / 2}px rgba(${glowColor}, ${glowOpacity})`
            : 'none',
          transition: 'transform 120ms ease-out, box-shadow 120ms ease-out',
        }}
      >
        {/* Inner background ring (gap between gradient ring and image) */}
        <div className="rounded-full bg-background p-[2px]">
          {/* Avatar image */}
          <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-neutral-800 sm:h-24 sm:w-24">
            <Image
              alt={name}
              className="object-cover"
              fill
              priority
              sizes="(max-width: 640px) 80px, 96px"
              src={`/characters/${image}`}
            />
          </div>
        </div>
      </div>

      {/* Character name */}
      <span className="font-medium text-foreground text-sm">{name}</span>
    </div>
  );
}
